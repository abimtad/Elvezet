import { Response } from "express";

type ResponsePayload<T> = {
  status: "success" | "error";
  data: T;
  message?: string;
};

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  data: T,
  message?: string,
): Response => {
  const payload: ResponsePayload<T> = {
    status: "success",
    data,
  };

  if (message) {
    payload.message = message;
  }

  return res.status(statusCode).json(payload);
};
