// Errors whose message is safe to show the client, with their HTTP status.
export class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
