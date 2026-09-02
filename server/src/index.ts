import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`JUASS Tablets Share API listening on port ${port}`);
});
