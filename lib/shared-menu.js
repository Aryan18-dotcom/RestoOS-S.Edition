import Branch from "@/models/Branch";
import Category from "@/models/Category";
import Product from "@/models/Product";

export async function getCategoryPath(categoryId) {
  const path = [];
  let current = await Category.findById(categoryId).lean();
  while (current) {
    path.unshift(current.name);
    current = current.parentCategoryId
      ? await Category.findById(current.parentCategoryId).lean()
      : null;
  }
  return path;
}

export async function getOrgBranchIds(orgId) {
  const branches = await Branch.find({ orgId, isActive: true }).select("_id").lean();
  return branches.map((branch) => branch._id);
}

export async function findCategoryForPath(branchId, path) {
  let parentCategoryId = null;
  let category = null;
  for (const name of path) {
    category = await Category.findOne({
      branchId,
      name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      parentCategoryId,
    }).lean();
    if (!category) return null;
    parentCategoryId = category._id;
  }
  return category;
}

export async function ensureCategoryForPath(branchId, path) {
  let parentCategoryId = null;
  let category = null;
  for (const name of path) {
    category = await Category.findOne({
      branchId,
      name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      parentCategoryId,
    });
    if (!category) {
      category = await Category.create({ branchId, name, parentCategoryId });
    }
    parentCategoryId = category._id;
  }
  return category;
}

export async function findEquivalentCategories(path, branchIds) {
  const categories = [];
  for (const branchId of branchIds) {
    const category = await findCategoryForPath(branchId, path);
    if (category) categories.push(category);
  }
  return categories;
}

export async function copyOrganizationMenuToBranch(orgId, targetBranchId) {
  const sourceBranches = await Branch.find({
    orgId,
    isActive: true,
    _id: { $ne: targetBranchId },
  }).sort({ createdAt: 1, _id: 1 }).select("_id").lean();
  if (!sourceBranches.length) return { categories: 0, products: 0 };

  const sourceBranchIds = sourceBranches.map((branch) => branch._id);
  const sourceCategories = await Category.find({ branchId: { $in: sourceBranchIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const sourceProducts = await Product.find({ branchId: { $in: sourceBranchIds } })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const categoriesById = new Map(sourceCategories.map((category) => [String(category._id), category]));
  const pathsById = new Map();
  const getPath = (category) => {
    const key = String(category._id);
    if (pathsById.has(key)) return pathsById.get(key);
    const parentId = category.parentCategoryId ? String(category.parentCategoryId) : "";
    const parent = parentId ? categoriesById.get(parentId) : null;
    const path = [...(parent ? getPath(parent) : []), category.name];
    pathsById.set(key, path);
    return path;
  };

  const targetCategories = new Map();
  for (const sourceCategory of sourceCategories) {
    const path = getPath(sourceCategory);
    const pathKey = path.map((name) => name.trim().toLowerCase()).join("/");
    if (!targetCategories.has(pathKey)) {
      targetCategories.set(pathKey, await ensureCategoryForPath(targetBranchId, path));
    }
  }

  const copiedProducts = new Set();
  for (const sourceProduct of sourceProducts) {
    const sourceCategory = categoriesById.get(String(sourceProduct.categoryId));
    if (!sourceCategory) continue;
    const path = getPath(sourceCategory);
    const pathKey = path.map((name) => name.trim().toLowerCase()).join("/");
    const targetCategory = targetCategories.get(pathKey);
    const productKey = `${pathKey}/${sourceProduct.name.trim().toLowerCase()}`;
    if (copiedProducts.has(productKey)) continue;
    copiedProducts.add(productKey);
    await Product.create({
      branchId: targetBranchId,
      categoryId: targetCategory._id,
      name: sourceProduct.name,
      price: sourceProduct.price,
      costPrice: null,
      isAvailable: sourceProduct.isAvailable,
    });
  }

  return { categories: targetCategories.size, products: copiedProducts.size };
}
