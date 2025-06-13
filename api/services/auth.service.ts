import { Response, NextFunction } from "express";
import admin from "firebase-admin";
import { CustomRequest } from "../interfaces/express.interface";
import logger from "../config/logger";

/**
 * Middleware to authenticate requests using Firebase Admin SDK.
 * It prioritizes session cookie authentication and falls back to Bearer token authentication.
 * If the token/cookie is valid, it attaches the decoded token (user information) to `req.user`.
 *
 * @param req - The custom request object, expected to extend Express's Request.
 * @param res - The response object from Express.
 * @param next - The next middleware function in the Express stack.
 */
export async function authenticate(
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionCookie = req.cookies.session;
  const authHeader = req.headers.authorization;

  // 1. Prioritize Session Cookie for authentication
  if (sessionCookie) {
    try {
      const decodedToken = await admin
        .auth()
        .verifySessionCookie(sessionCookie, true); // true checks for revocation
      req.user = decodedToken;
      logger.info(
        `User authenticated successfully via session cookie: ${decodedToken.uid}`
      );
      return next();
    } catch (error: any) {
      logger.error(`Error verifying session cookie: ${error.message}`, {
        stack: error.stack,
        details: error,
      });
      // If cookie is invalid, respond immediately.
      // Do not fall back to bearer token to avoid ambiguity in auth method.
      res
        .status(403)
        .json({ message: "Forbidden: Invalid or expired session cookie" });
      return;
    }
  }

  // 2. Fallback to Bearer Token if no session cookie is present
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.split(" ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      logger.info(
        `User authenticated successfully via Bearer token: ${decodedToken.uid}`
      );
      return next();
    } catch (error: any) {
      logger.error(`Error verifying Firebase ID token: ${error.message}`, {
        stack: error.stack,
        tokenUsed: idToken ? idToken.substring(0, 10) + "..." : "N/A",
        details: error,
      });
      res.status(403).json({ message: "Forbidden: Invalid or expired token" });
      return;
    }
  }

  // 3. If neither authentication method is successful
  logger.warn(
    "Authentication attempt failed: No session cookie or Bearer token provided."
  );
  res
    .status(401)
    .json({ message: "Unauthorized: No authentication credentials provided" });
}
