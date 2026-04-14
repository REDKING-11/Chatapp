const express = require("express");
const cors = require("cors");
require("dotenv").config();

const serverRoutes = require("./routes/server.routes");
const channelRoutes = require("./routes/channel.routes");
const messageRoutes = require("./routes/message.routes");
const memberRoutes = require("./routes/member.routes");
const customizationRoutes = require("./routes/customization.routes");
const profileAssetsRoutes = require("./routes/profileAssets.routes");
const serverProfilesRoutes = require("./routes/serverProfiles.routes");
const dmRoutes = require("./routes/dm.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
    cors({
        origin: true,
        credentials: false
    })
);

app.use(express.json());

app.use("/api", serverRoutes);
app.use("/api", channelRoutes);
app.use("/api", messageRoutes);
app.use("/api", memberRoutes);
app.use("/api", customizationRoutes);
app.use("/api", profileAssetsRoutes);
app.use("/api", serverProfilesRoutes);
app.use("/api", dmRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
