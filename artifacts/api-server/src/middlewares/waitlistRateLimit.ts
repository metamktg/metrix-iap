import rateLimit from "express-rate-limit";

export const waitlistRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    req.log?.warn({ ip: req.ip }, "waitlist signup rate limit exceeded");
    res
      .status(429)
      .json({ message: "Too many signup attempts. Please try again shortly." });
  },
});
