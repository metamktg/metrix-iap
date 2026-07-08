import rateLimit from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    req.log?.warn({ ip: req.ip }, "login rate limit exceeded");
    res
      .status(429)
      .json({ message: "Too many login attempts. Please try again in a few minutes." });
  },
});
