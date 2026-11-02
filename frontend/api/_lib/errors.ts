export class ApiError extends Error {
  readonly headers: Record<string, string>

  constructor(
    message: string,
    readonly status: number,
    headers?: Record<string, string>,
  ) {
    super(message)
    this.headers = headers ?? {}
  }
}
