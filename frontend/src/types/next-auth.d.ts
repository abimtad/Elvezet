import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    devUserId?: string;
    roles?: string[];
  }

  interface User {
    accessToken?: string;
    devUserId?: string;
    roles?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    devUserId?: string;
    roles?: string[];
    uid?: string;
  }
}
