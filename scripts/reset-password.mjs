import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/restaurant-pos";

const userSchema = new mongoose.Schema({
  loginId: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String },
  isTemporaryPass: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 },
});

await mongoose.connect(uri, { bufferCommands: false });
const User = mongoose.model("User", userSchema);

// List all users
const users = await User.find({}).select("loginId role isActive");
console.log("\n=== USERS IN DATABASE ===");
users.forEach(u => console.log(`  LoginID: ${u.loginId}  |  Role: ${u.role}  |  Active: ${u.isActive}`));

if (users.length === 0) {
  console.log("No users found. Creating a new SuperAdmin...");
  const newPass = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(newPass, 12);
  await User.create({
    loginId: "root",
    passwordHash: hash,
    role: "SUPERADMIN",
    isTemporaryPass: true,
    isActive: true,
    sessionVersion: 0,
  });
  console.log("\n✅ SuperAdmin created!");
  console.log(`   Login ID : root`);
  console.log(`   Password : ${newPass}`);
} else {
  // Reset password of the first active user (or first superadmin)
  const target = users.find(u => u.role === "SUPERADMIN") || users[0];
  const newPass = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(newPass, 12);
  await User.updateOne(
    { _id: target._id },
    { passwordHash: hash, isTemporaryPass: true, sessionVersion: 0 }
  );
  console.log(`\n✅ Password reset for: ${target.loginId}`);
  console.log(`   Login ID : ${target.loginId}`);
  console.log(`   Password : ${newPass}`);
}

console.log("\n⚠️  Save this password now — it won't be shown again.\n");
await mongoose.disconnect();
