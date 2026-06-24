// EventBridge Scheduler target — poll Trendyol for missed orders (§4). P0: empty skeleton.
import { runPoll } from "../poll/run.js";

export const handler = async () => runPoll("trendyol");
