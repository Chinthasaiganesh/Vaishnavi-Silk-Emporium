import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  publicApiOrigin: process.env.PUBLIC_API_ORIGIN || `http://localhost:${process.env.PORT || 4000}`,
  jwtSecret: process.env.JWT_SECRET || "change-this-in-production",
  nodeEnv: process.env.NODE_ENV || "development",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  userUsername: process.env.USER_USERNAME || "customer",
  userPassword: process.env.USER_PASSWORD || "Customer@12345",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  githubClientId: process.env.GITHUB_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || ""
};
