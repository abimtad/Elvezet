import { IBusiness } from "../models/Business";
import { IUser } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      auth?: Record<string, unknown>;
      business?: IBusiness;
    }
  }
}

export {};
