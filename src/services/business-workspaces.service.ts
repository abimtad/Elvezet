import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import { IUser } from "../models/User";

export async function businessWorkspaces(user: IUser) {
  const [owned, memberships] = await Promise.all([
    Business.find({ ownerId: user._id }).select("name type").lean(),
    StaffProfile.find({ staffId: { $in: [String(user._id), user.firebaseUid] }, isActive: true }).select("businessId").lean(),
  ]);
  const shops = await Business.find({ _id: { $in: memberships.map(p => p.businessId) }, type: "shop" }).select("name").lean();
  return [
    ...owned.map(b => ({ id: `${b.type === "independent" ? "independent" : "owner"}:${b._id}`, role: b.type === "independent" ? "independent" : "owner", businessId: String(b._id), name: b.name })),
    ...shops.map(b => ({ id: `staff:${b._id}`, role: "staff", businessId: String(b._id), name: b.name })),
  ];
}
