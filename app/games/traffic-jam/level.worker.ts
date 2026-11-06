import { generateLevel } from "./levels";
self.onmessage = (event: MessageEvent<number>) => {
  try { self.postMessage({ level: generateLevel(event.data) }); }
  catch { self.postMessage({ error: "The next puzzle could not be generated. Please retry." }); }
};
