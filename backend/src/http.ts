import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 ignores rejected promises: wrap async handlers so their errors
// reach the error middleware instead of hanging the request.
export function route(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const parseId = (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : 0;
};
