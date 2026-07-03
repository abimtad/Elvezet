/**
 * Seeds a complete "Must Dash" shop tenant for local workstation development.
 *
 * Usage: npx tsx src/scripts/seedMustDash.ts
 *
 * Dev auth: set header x-dev-user-id to the printed owner MongoDB _id (or firebaseUid).
 */
import dotenv from "dotenv";
import { writeFileSync } from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import Availability from "../models/Availability";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Client from "../models/Client";
import Category from "../models/Category";
import Product from "../models/Product";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import {
  MUSTDASH_LOCATION,
  SHOP_NAME,
  mustDashGeoPoint,
} from "./mustDashSeedConfig";

dotenv.config();

const OWNER = {
  firebaseUid: "mustdash-owner-dev",
  fullName: "Test Owner",
  email: "owner@test.com",
  phoneNumber: "+251911000001",
};

const ADMIN = {
  firebaseUid: "mustdash-admin-dev",
  fullName: "Test Admin",
  email: "admin@test.com",
  phoneNumber: "+251911000010",
};

const CUSTOMER = {
  firebaseUid: "mustdash-customer-dev",
  fullName: "Test Customer",
  email: "customer@test.com",
  phoneNumber: "+251911000099",
};

const STAFF = [
  {
    firebaseUid: "mustdash-staff-abebe",
    fullName: "Abebe Kebede",
    email: "abebe@mustdash.local",
    phoneNumber: "+251911000002",
  },
  {
    firebaseUid: "mustdash-staff-solomon",
    fullName: "Solomon Tadesse",
    email: "solomon@mustdash.local",
    phoneNumber: "+251911000003",
  },
  {
    firebaseUid: "mustdash-staff-ruth",
    fullName: "Ruth Haile",
    email: "ruth@mustdash.local",
    phoneNumber: "+251911000004",
  },
];

const SERVICE_DEFS = [
  { name: "Classic Haircut", categoryName: "Haircut", duration: 30, basePrice: 250 },
  { name: "Fade & Shape", categoryName: "Haircut", duration: 45, basePrice: 350 },
  { name: "Beard Trim", categoryName: "Grooming", duration: 20, basePrice: 150 },
  { name: "Hot Towel Shave", categoryName: "Grooming", duration: 30, basePrice: 200 },
  { name: "Hair Wash", categoryName: "Haircare", duration: 15, basePrice: 100 },
  { name: "Deep Conditioning", categoryName: "Haircare", duration: 45, basePrice: 400 },
  { name: "Manicure", categoryName: "Nails", duration: 40, basePrice: 300 },
  { name: "Pedicure", categoryName: "Nails", duration: 50, basePrice: 350 },
  { name: "Scalp Treatment", categoryName: "Treatment", duration: 60, basePrice: 500 },
  { name: "Kids Cut", categoryName: "Haircut", duration: 25, basePrice: 180 },
];

const CATEGORY_DEFS = [
  "Barber Shop",
  "Hair Salon",
  "Beauty & Spa",
  "Makeup Artist",
  "Nails",
  "Massage",
  "Facial",
];

const PRODUCT_DEFS = [
  { name: "Beard Oil", brand: "Must Dash", price: 450, stockQuantity: 24, minStockAlert: 5 },
  { name: "Matte Pomade", brand: "Uppercut", price: 380, stockQuantity: 18, minStockAlert: 4 },
  { name: "Moisture Shampoo", brand: "Olaplex", price: 520, stockQuantity: 12, minStockAlert: 3 },
  { name: "Hair Wax", brand: "Gatsby", price: 290, stockQuantity: 30, minStockAlert: 6 },
  { name: "Styling Gel", brand: "Got2b", price: 220, stockQuantity: 8, minStockAlert: 5 },
];

const CLIENT_DEFS = [
  { fullName: "Dawit Mekonnen", phoneNumber: "+251922100001", email: "dawit@example.com", totalSpend: 1200 },
  { fullName: "Hanna Girma", phoneNumber: "+251922100002", email: "hanna@example.com", totalSpend: 850 },
  { fullName: "Yonas Tesfaye", phoneNumber: "+251922100003", email: "yonas@example.com", totalSpend: 2100 },
  { fullName: "Sara Bekele", phoneNumber: "+251922100004", email: "sara@example.com", totalSpend: 640 },
  { fullName: "Michael Alemu", phoneNumber: "+251922100005", email: "michael@example.com", totalSpend: 430 },
  { fullName: "Walk-in Guest", phoneNumber: "+251922100099", email: "walkin@mustdash.local", totalSpend: 0 },
];

const upsertUser = async (input: {
  firebaseUid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
}) => {
  const user = await User.findOneAndUpdate(
    { firebaseUid: input.firebaseUid },
    {
      firebaseUid: input.firebaseUid,
      fullName: input.fullName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      roles: input.roles,
      isVerified: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return user;
};

const todayAt = (hour: number, minute: number): Date => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60 * 1000);

const connect = async (): Promise<void> => {
  const rawUri = process.env.MONGO_URI;
  if (!rawUri) throw new Error("MONGO_URI is not defined");

  const mongoUri = rawUri
    .replace("<db_username>", process.env.MONGO_USER || "")
    .replace("<db_password>", process.env.MONGO_PASSWORD || "");

  await mongoose.connect(mongoUri);
};

const seed = async (): Promise<void> => {
  console.log("🌱 Seeding Must Dash tenant...\n");

  const owner = await upsertUser({ ...OWNER, roles: ["owner"] });
  const adminUser = await upsertUser({ ...ADMIN, roles: ["admin"] });
  const customer = await upsertUser({ ...CUSTOMER, roles: ["customer"] });
  const staffUsers = await Promise.all(
    STAFF.map((member) => upsertUser({ ...member, roles: ["staff"] })),
  );

  await Promise.all(
    CATEGORY_DEFS.map((name) =>
      Category.updateOne(
        { name },
        { $set: { name, isActive: true } },
        { upsert: true },
      ),
    ),
  );

  const mustDashCategory = await Category.findOne({
    name: "Barber Shop",
    isActive: true,
  });
  if (!mustDashCategory) {
    throw new Error("Barber Shop business category was not seeded");
  }

  let business = await Business.findOne({ name: SHOP_NAME, ownerId: owner._id });

  if (business) {
    const businessId = business._id;
    business.location = mustDashGeoPoint();
    business.homeLocation = mustDashGeoPoint();
    business.addressString = MUSTDASH_LOCATION.addressString;
    business.businessCategoryId = mustDashCategory._id;
    business.businessCategoryName = mustDashCategory.name;
    business.verificationStatus = "active";
    business.isVisible = true;
    await Booking.deleteMany({ businessId });
    await Client.deleteMany({ businessId });
    await Product.deleteMany({ businessId });
    await Service.deleteMany({ businessId });
    await Availability.deleteMany({
      staffId: { $in: staffUsers.map((u) => u.firebaseUid) },
    });
    await StaffProfile.deleteMany({ businessId });
    console.log("♻️  Cleared existing Must Dash catalog & bookings for re-seed.");
  } else {
    business = await Business.create({
      name: SHOP_NAME,
      type: "shop",
      ownerId: owner._id,
      businessCategoryId: mustDashCategory._id,
      businessCategoryName: mustDashCategory.name,
      location: mustDashGeoPoint(),
      homeLocation: mustDashGeoPoint(),
      addressString: MUSTDASH_LOCATION.addressString,
      genderTarget: "male",
      verificationStatus: "active",
      isVisible: true,
      averagePrice: 280,
      openingTime: "09:00",
      closingTime: "18:00",
      slotInterval: 15,
      description: "Premium barbershop in Bole — Must Dash demo tenant.",
    });
  }

  const businessId = business._id;
  const serviceDocs = await Service.insertMany(
    SERVICE_DEFS.map((svc, index) => ({
      businessId,
      name: svc.name,
      duration: svc.duration,
      basePrice: svc.basePrice,
      category: svc.categoryName.toLowerCase(),
      categoryName: svc.categoryName,
      sortOrder: index,
    })),
  );

  const allServiceIds = serviceDocs.map((s) => s._id);

  await Product.insertMany(
    PRODUCT_DEFS.map((p) => ({
      businessId,
      ...p,
    })),
  );

  const staffProfiles = await Promise.all(
    staffUsers.map((user, index) =>
      StaffProfile.create({
        staffId: user.firebaseUid,
        businessId,
        services: allServiceIds,
        specialties: [SERVICE_DEFS[index % SERVICE_DEFS.length].categoryName],
        isActive: true,
      }),
    ),
  );

  // Open every day of the week (0=Sun ... 6=Sat) so the booking calendar is
  // fully populated rather than only today/tomorrow.
  const weekDays = [0, 1, 2, 3, 4, 5, 6];
  await Availability.insertMany(
    staffProfiles.flatMap((profile) =>
      weekDays.map((dayOfWeek) => ({
        staffId: profile.staffId,
        dayOfWeek,
        startTime: "09:00",
        endTime: "18:00",
      })),
    ),
  );

  const clients = await Client.insertMany(
    CLIENT_DEFS.map((c) => ({
      businessId,
      fullName: c.fullName,
      phoneNumber: c.phoneNumber,
      email: c.email,
      totalSpend: c.totalSpend,
      lastVisit: new Date(),
    })),
  );

  const bookingPlans: Array<{
    clientIndex: number;
    staffIndex: number;
    serviceIndex: number;
    hour: number;
    minute: number;
    status: "pending" | "confirmed";
    paymentStatus: "unpaid" | "paid";
    isWalkIn?: boolean;
  }> = [
    { clientIndex: 5, staffIndex: 0, serviceIndex: 0, hour: 9, minute: 0, status: "confirmed", paymentStatus: "paid", isWalkIn: true },
    { clientIndex: 0, staffIndex: 0, serviceIndex: 0, hour: 10, minute: 0, status: "confirmed", paymentStatus: "paid" },
    { clientIndex: 1, staffIndex: 1, serviceIndex: 1, hour: 11, minute: 30, status: "confirmed", paymentStatus: "paid" },
    { clientIndex: 2, staffIndex: 2, serviceIndex: 6, hour: 13, minute: 0, status: "confirmed", paymentStatus: "paid" },
    { clientIndex: 3, staffIndex: 1, serviceIndex: 2, hour: 14, minute: 0, status: "pending", paymentStatus: "unpaid" },
    { clientIndex: 0, staffIndex: 0, serviceIndex: 3, hour: 15, minute: 0, status: "confirmed", paymentStatus: "paid" },
    { clientIndex: 4, staffIndex: 2, serviceIndex: 4, hour: 16, minute: 30, status: "confirmed", paymentStatus: "unpaid", isWalkIn: true },
    { clientIndex: 1, staffIndex: 0, serviceIndex: 5, hour: 17, minute: 0, status: "confirmed", paymentStatus: "unpaid" },
  ];

  for (const plan of bookingPlans) {
    const client = clients[plan.clientIndex];
    const staff = staffUsers[plan.staffIndex];
    const service = serviceDocs[plan.serviceIndex];
    const startTime = todayAt(plan.hour, plan.minute);
    const endTime = addMinutes(startTime, service.duration);

    await Booking.create({
      userId: String(client._id),
      businessId,
      clientId: client._id,
      staffId: staff.firebaseUid,
      serviceIds: [service._id],
      serviceId: service._id,
      totalAmount: service.basePrice,
      staffPlan: [
        {
          staffId: staff.firebaseUid,
          serviceId: service._id,
          startTime,
          endTime,
        },
      ],
      startTime,
      endTime,
      status: plan.status,
      paymentMethod: "in-shop",
      paymentStatus: plan.paymentStatus,
      paidAt: plan.paymentStatus === "paid" ? new Date() : undefined,
      isWalkIn: plan.isWalkIn ?? false,
    });
  }

  const devSeedPath = path.join(
    process.cwd(),
    "frontend",
    "public",
    "dev-seed.json",
  );
  writeFileSync(
    devSeedPath,
    JSON.stringify(
      {
        ownerId: String(owner._id),
        firebaseUid: owner.firebaseUid,
        shopId: String(businessId),
        email: owner.email,
        shopName: SHOP_NAME,
        addressString: MUSTDASH_LOCATION.addressString,
        latitude: MUSTDASH_LOCATION.latitude,
        longitude: MUSTDASH_LOCATION.longitude,
        customerId: String(customer._id),
        customerFirebaseUid: customer.firebaseUid,
        adminId: String(adminUser._id),
        adminFirebaseUid: adminUser.firebaseUid,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${devSeedPath} for offline dev login.`);

  const avgPrice =
    serviceDocs.reduce((sum, s) => sum + s.basePrice, 0) / serviceDocs.length;
  business.averagePrice = Math.round(avgPrice);
  await business.save();

  console.log("✅ Must Dash seed complete\n");
  console.log(
    "ℹ️  New shops start with no reviews. Run npm run seed:mustdash-reviews for demo Must Dash reviews.\n",
  );
  console.log("── Dev credentials ──");
  console.log(`Shop ID:     ${String(businessId)}`);
  console.log(`Owner ID:    ${String(owner._id)}`);
  console.log(`Owner UID:   ${owner.firebaseUid}`);
  console.log(`\nOwner dev header: x-dev-user-id: ${String(owner._id)}`);
  console.log(`Admin dev header:  x-dev-user-id: ${String(adminUser._id)}`);
  console.log(`Customer dev header: x-dev-user-id: ${String(customer._id)}`);
  console.log(`(or firebaseUid: ${owner.firebaseUid})\n`);
  console.log(`Staff: ${staffUsers.map((s) => s.fullName).join(", ")}`);
  console.log(`Services: ${serviceDocs.length} | Products: ${PRODUCT_DEFS.length}`);
  console.log(
    `Clients: ${clients.length} | Bookings today: ${bookingPlans.length} (incl. walk-ins + pending)`,
  );
};

const main = async (): Promise<void> => {
  try {
    await connect();
    await seed();
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void main();
