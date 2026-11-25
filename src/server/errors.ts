/** Erro de regra de negócio com mensagem pronta para o usuário. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class AccessDeniedError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
