import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Likes, saves, reports and sign-ins each leave a small row per time window.
crons.interval("clear old rate-limit windows", { hours: 24 }, internal.rateLimit.cleanup, {});

export default crons;
