/**
 * seed-restaurant.mjs
 * Creates a sample Organization, Branch, Owner user, and Captain user.
 * Run: node --env-file=.env.local scripts/seed-restaurant.mjs
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/restaurant-pos";

// ── Schemas ────────────────────────────────────────────────────────────────
const OrgSchema = new mongoose.Schema({ name: { type: String, required: true } });
const BranchSchema = new mongoose.Schema({
  orgId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  name:     { type: String, required: true },
  code:     { type: String, required: true },
  address:  { type: String, default: "" },
  isActive: { type: Boolean, default: true },
});
const UserSchema = new mongoose.Schema({
  orgId:           { type: mongoose.Schema.Types.ObjectId, default: null },
  branchId:        { type: mongoose.Schema.Types.ObjectId, default: null },
  loginId:         { type: String, required: true, unique: true },
  passwordHash:    { type: String, required: true, select: false },
  role:            { type: String, enum: ["SUPERADMIN", "OWNER", "CAPTAIN"] },
  isTemporaryPass: { type: Boolean, default: true },
  isActive:        { type: Boolean, default: true },
  sessionVersion:  { type: Number, default: 0 },
});

await mongoose.connect(uri, { bufferCommands: false });

const Org    = mongoose.model("Organization", OrgSchema);
const Branch = mongoose.model("Branch", BranchSchema);
const User   = mongoose.model("User", UserSchema);

// ── Create Organisation ────────────────────────────────────────────────────
let org = await Org.findOne({ name: "My Restaurant" });
if (!org) {
  org = await Org.create({ name: "My Restaurant" });
  console.log(`✅ Organization created: My Restaurant (id: ${org._id})`);
} else {
  console.log(`ℹ️  Organization already exists: My Restaurant (id: ${org._id})`);
}

// ── Create Branch ──────────────────────────────────────────────────────────
let branch = await Branch.findOne({ orgId: org._id, code: "MAIN" });
if (!branch) {
  branch = await Branch.create({
    orgId:   org._id,
    name:    "Main Branch",
    code:    "MAIN",
    address: "123 Restaurant Street",
  });
  console.log(`✅ Branch created: Main Branch (id: ${branch._id})`);
} else {
  console.log(`ℹ️  Branch already exists: Main Branch (id: ${branch._id})`);
}

// ── Create Owner user ──────────────────────────────────────────────────────
const ownerPass = randomBytes(10).toString("base64url");
let owner = await User.findOne({ loginId: "owner1" });
if (!owner) {
  await User.create({
    orgId:           org._id,
    branchId:        null,
    loginId:         "owner1",
    passwordHash:    await bcrypt.hash(ownerPass, 12),
    role:            "OWNER",
    isTemporaryPass: true,
    isActive:        true,
  });
  console.log(`\n✅ Owner user created`);
  console.log(`   Login ID : owner1`);
  console.log(`   Password : ${ownerPass}`);
} else {
  const newPass = randomBytes(10).toString("base64url");
  await User.updateOne({ loginId: "owner1" }, { passwordHash: await bcrypt.hash(newPass, 12), sessionVersion: 0 });
  console.log(`\n✅ Owner password reset`);
  console.log(`   Login ID : owner1`);
  console.log(`   Password : ${newPass}`);
}

// ── Create Captain (billing counter) user ──────────────────────────────────
const captainPass = randomBytes(10).toString("base64url");
let captain = await User.findOne({ loginId: "captain1" });
if (!captain) {
  await User.create({
    orgId:           org._id,
    branchId:        branch._id,
    loginId:         "captain1",
    passwordHash:    await bcrypt.hash(captainPass, 12),
    role:            "CAPTAIN",
    isTemporaryPass: true,
    isActive:        true,
  });
  console.log(`\n✅ Captain (billing counter) user created`);
  console.log(`   Login ID : captain1`);
  console.log(`   Password : ${captainPass}`);
} else {
  const newPass = randomBytes(10).toString("base64url");
  await User.updateOne({ loginId: "captain1" }, { passwordHash: await bcrypt.hash(newPass, 12), sessionVersion: 0 });
  console.log(`\n✅ Captain password reset`);
  console.log(`   Login ID : captain1`);
  console.log(`   Password : ${newPass}`);
}

console.log(`\n⚠️  Save these passwords — they won't be shown again.\n`);
await mongoose.disconnect();
