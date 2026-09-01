export class MissingSystemConfigError extends Error {
  constructor(readonly keys: string[]) {
    super(`Configurações ausentes em system_configs: ${keys.join(', ')}.`);
    this.name = MissingSystemConfigError.name;
  }
}
