export function isBranchManagerRole(role) {
  return role === "BRANCH_MANAGER" || role === "CAPTAIN";
}

export function displayRole(role) {
  return isBranchManagerRole(role) ? "BRANCH_MANAGER" : role;
}
