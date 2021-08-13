import { Request, Response } from 'express';

import BuscarSolicitacoesUseCase from './BuscarSolicitacoesUseCase';

class BuscarSolicitacoesController {
  constructor(private buscarSolicitacoesUseCase: BuscarSolicitacoesUseCase) {}

  async handle(request: Request, response: Response): Promise<Response> {
    const empresaOperadora = Number(request.query.empresaOperadora);
    const contaContrato = request.query.contaContrato as string;
    const codigoNota = request.query.codigoNota as string;
    const telefone = request.query.telefone as string;

    const solicitacoes = await this.buscarSolicitacoesUseCase.execute({
      empresaOperadora,
      contaContrato,
      codigoNota,
      telefone,
    });

    return response.json(solicitacoes);
  }
}

export default BuscarSolicitacoesController;
