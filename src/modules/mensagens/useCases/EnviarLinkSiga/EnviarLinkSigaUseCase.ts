import { inject, injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';

import AppError from '../../../../errors/AppError';
import prepararMensagemSiga from '../../../../util/prepararMensagemSiga';
import verificarTelefoneMaisUsado from '../../../../util/verficiarTelefoneMaisUsado';
import IClientesAPIRepository from '../../../clientes/repositories/IClientesAPIRepository';
import IClientesTabCadastroRepository from '../../../clientes/repositories/IClientesTabCadastroRepository';
import ILogsMensagensRepository from '../../../logs/repositories/ILogsMensagensRepository';
import ISolicitacoesRepository from '../../../solicitacoes/repositories/ISolicitacoesRepository';
import IMensagensRepository from '../../repositories/IMensagensRepository';

interface IRequest {
  empresaOperadora: number;
  contaContrato: string;
  codigoNota: string;
  link: string;
}

interface ITelefonesParaEnvio {
  principal: string;
  secundario?: string;
}

@injectable()
class EnviarLinkSigaUseCase {
  constructor(
    @inject('MensagensRepository')
    private mensagensRepository: IMensagensRepository,

    @inject('SolicitacoesRepository')
    private solicitacoesRepository: ISolicitacoesRepository,

    @inject('ClientesAPIRepository')
    private clientesAPIRepository: IClientesAPIRepository,

    @inject('ClientesTabCadastroRepository')
    private clientesTabCadastroRepository: IClientesTabCadastroRepository,

    @inject('LogsMensagensRepository')
    private logsMensagensRepository: ILogsMensagensRepository,
  ) {}

  async execute({
    empresaOperadora,
    contaContrato,
    codigoNota,
    link,
  }: IRequest): Promise<void> {
    const telefonesParaEnvio: ITelefonesParaEnvio = {} as ITelefonesParaEnvio;

    // Buscando telefone nas solicitações
    const solicitacoes = await this.solicitacoesRepository.buscarSolicitacoes({
      empresaOperadora,
      contaContrato,
    });

    if (!solicitacoes.length) {
      // Se não encontrar nas solicitações, buscar na API de clientes
      const { telefoneMovel: telMovelAPI } =
        await this.clientesAPIRepository.buscarPorContaContrato({
          empresaOperadora,
          contaContrato,
        });

      if (telMovelAPI.length) {
        // Se encontrar na API de clientes ...
        Object.assign(telefonesParaEnvio, {
          principal: telMovelAPI[0],
          secundario: telMovelAPI[1] || undefined,
        });
      } else {
        // Se não encontrar na API de clientes, buscar na tabela de cadastro
        const { telefoneMovel: telMovelCadastro } =
          await this.clientesTabCadastroRepository.buscarPorContaContrato({
            empresaOperadora,
            contaContrato,
          });

        if (!telMovelCadastro.length) {
          throw new AppError('O cliente não possui telefones cadastrados');
        }

        Object.assign(telefonesParaEnvio, {
          principal: telMovelCadastro[0],
          secundario: telMovelCadastro[1] || undefined,
        });
      }
    }

    // Se existirem solicitações, filtrar pelo código da nota
    const solicitacaoEncontrada = solicitacoes.filter(
      solicitacao => solicitacao.codigoNota === codigoNota,
    )[0];

    if (solicitacaoEncontrada) {
      Object.assign(telefonesParaEnvio, {
        principal: solicitacaoEncontrada.telefone,
      });
    } else {
      // Se não encontrar uma solicitação baseada no código da nota, verificar o telefone mais utilizado
      const telefoneMaisUsado = verificarTelefoneMaisUsado(solicitacoes);

      Object.assign(telefonesParaEnvio, {
        principal: telefoneMaisUsado,
      });
    }

    // Verifica se existe uma sessão ativa com o cliente
    const idSessaoAtiva =
      solicitacaoEncontrada && solicitacaoEncontrada.sessaoAtiva
        ? solicitacaoEncontrada.sessao
        : undefined;

    await this.mensagensRepository.enviarLinkSiga({
      empresaOperadora,
      telefone: '9882045774',
      // telefone: telefonesParaEnvio.principal,
      contaContrato,
      codigoNota,
      tipoSolicitacao: solicitacaoEncontrada.tipoSolicitacao,
      link,
      idSessaoAtiva,
    });

    await this.logsMensagensRepository.gravarLogMensagem({
      empresaOperadora,
      canal: 'whatsapp',
      sessao: idSessaoAtiva || undefined,
      telefone: telefonesParaEnvio.principal,
      dataEnvio: new Date(),
      idEnvio: uuidv4(),
      mensagemEnviada: prepararMensagemSiga(
        solicitacaoEncontrada.tipoSolicitacao,
        codigoNota,
        link,
      ).replace(/\*/g, ''), // VERIFICAR
      tipoSolicitacao: `SIGA_ACOMPANHAMENTO`,
      codigoServico: solicitacaoEncontrada.codigoServico || undefined,
      codigoNota: solicitacaoEncontrada.codigoNota || undefined,
      contaContrato,
      categoria: idSessaoAtiva ? 'PUSH' : 'PUSH - ATIVO',
      usuario: 'teste', // HARD CODDED
      dataNota: solicitacaoEncontrada.dataSolicitacao || undefined,
    });
  }
}

export default EnviarLinkSigaUseCase;
