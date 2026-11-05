import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const uri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/restaurant-pos";
const loginId = process.env.BOOTSTRAP_LOGIN_ID || "root";

const userSchema = new mongoose.Schema({
  orgId: { type: mongoose.Schema.Types.ObjectId, default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
  loginId: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["SUPERADMIN", "OWNER", "CAPTAIN"], required: true },
  isTemporaryPass: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 },
});

try {
  await mongoose.connect(uri, { bufferCommands: false });
  const User = mongoose.model("User", userSchema);
  if (await User.exists({ role: "SUPERADMIN" })) {
    throw new Error("A SuperAdmin already exists; bootstrap is limited to the first account");
  }

  const temporaryPassword = randomBytes(18).toString("base64url");
  await User.create({
    loginId,
    passwordHash: await bcrypt.hash(temporaryPassword, 12),
    role: "SUPERADMIN",
    isTemporaryPass: true,
    isActive: true,
  });

  console.log(`SuperAdmin created. Login ID: ${loginId}`);
  console.log(`One-time temporary password: ${temporaryPassword}`);
  console.log("Store this password securely; it will not be shown again.");
} finally {
  await mongoose.disconnect();
}
