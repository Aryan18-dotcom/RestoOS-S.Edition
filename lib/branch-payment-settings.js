import Branch from "@/models/Branch";
import Organization from "@/models/Organization";

export async function migrateLegacyUpiSettings(orgId) {
  const organization = await Organization.findById(orgId)
    .select("upiId upiPayerName upiSettingsMigratedToBranches")
    .lean();
  if (!organization || organization.upiSettingsMigratedToBranches) return;

  const branches = await Branch.find({ orgId })
    .select("_id upiId payerName")
    .lean();
  if (!branches.length) return;
  const updates = branches.flatMap((branch) => {
    const values = {};
    if (!branch.upiId && organization.upiId) values.upiId = organization.upiId;
    if (!branch.payerName && organization.upiPayerName) values.payerName = organization.upiPayerName;
    return Object.keys(values).length
      ? [{ updateOne: { filter: { _id: branch._id, orgId }, update: { $set: values } } }]
      : [];
  });

  if (updates.length) await Branch.bulkWrite(updates);
  await Organization.updateOne(
    { _id: orgId, upiSettingsMigratedToBranches: { $ne: true } },
    { $set: { upiSettingsMigratedToBranches: true } },
  );
}
