import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import Availability from "../models/Availability";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Category from "../models/Category";
import Client from "../models/Client";
import Product from "../models/Product";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import { getFirebaseAdmin, initializeFirebaseAdmin } from "../config/firebase";

dotenv.config();

const DEMO_PREFIX = "demo-marketplace";
const DEFAULT_PASSWORD = "Demo@2026!";

type BusinessType = "shop" | "independent";

type DemoService = {
  name: string;
  categoryName: string;
  duration: number;
  basePrice: number;
};

type DemoBusiness = {
  slug: string;
  name: string;
  type: BusinessType;
  categoryName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  phoneNumber: string;
  addressString: string;
  latitude: number;
  longitude: number;
  description: string;
  openingTime: string;
  closingTime: string;
  closedDays?: number[];
  services: DemoService[];
  staffNames?: string[];
  /** When true: gallery is filled but main cover/logo are omitted (defaults UI). */
  omitMainImage?: boolean;
  travel?: {
    bufferRange: number;
    travelRate: number;
    minTravelFee: number;
    maxTravelDistance: number;
  };
};

type CredentialRow = {
  businessName: string;
  type: BusinessType;
  categoryName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  firebaseUid: string;
  devHeader: string;
  addressString: string;
  hours: string;
  services: string;
  description: string;
};

let firebaseReady = false;

const imageFiles = [
  "stephan-louis-L3s5QySz5UM-unsplash.jpg",
  "nathon-oski-fE42nRlBcG8-unsplash.jpg",
  "nathon-oski-EW_rqoSdDes-unsplash.jpg",
  "mediamodifier-W7AyAs7azHc-unsplash.jpg",
  "massage-a-domicile-nMVUTY8_gGw-unsplash.jpg",
  "jeppe-monster-T_gTN3Po9RQ-unsplash.jpg",
  "jason-leung-2seUdPQNy_I-unsplash.jpg",
  "hannah-skelly-g5A9gO59ERU-unsplash.jpg",
  "gulom-nazarov-DrG4V5skbMY-unsplash.jpg",
  "delfina-pan-wJoB8D3hnzc-unsplash.jpg",
  "christina-wocintechchat-com-m-0Zx1bDv5BNY-unsplash.jpg",
  "averie-woodard-4nulm-JUYFo-unsplash.jpg",
  "andre-reis-1_DAlXy0wng-unsplash.jpg",
  "amy-hirschi-b3AYk8HKCl0-unsplash.jpg",
  "alan-caishan-cU53ZFBr3lk-unsplash.jpg",
  "agustin-fernandez-1Pmp9uxK8X8-unsplash.jpg",
];

const categories = [
  "Barber Shop",
  "Hair Salon",
  "Beauty & Spa",
  "Makeup Artist",
  "Massage",
  "Nails",
];

const barberServices: DemoService[] = [
  { name: "Classic Haircut", categoryName: "Haircut", duration: 30, basePrice: 250 },
  { name: "Skin Fade", categoryName: "Haircut", duration: 45, basePrice: 380 },
  { name: "Beard Trim", categoryName: "Grooming", duration: 20, basePrice: 180 },
  { name: "Hot Towel Shave", categoryName: "Grooming", duration: 30, basePrice: 260 },
  { name: "Hair Wash", categoryName: "Haircare", duration: 15, basePrice: 120 },
];

const hairSalonServices: DemoService[] = [
  { name: "Women's Haircut", categoryName: "Hair", duration: 50, basePrice: 520 },
  { name: "Blow Dry", categoryName: "Styling", duration: 35, basePrice: 350 },
  { name: "Silk Press", categoryName: "Styling", duration: 75, basePrice: 900 },
  { name: "Root Color", categoryName: "Color", duration: 90, basePrice: 1200 },
  { name: "Deep Conditioning", categoryName: "Treatment", duration: 45, basePrice: 480 },
];

const spaServices: DemoService[] = [
  { name: "Express Facial", categoryName: "Facial", duration: 40, basePrice: 650 },
  { name: "Hydrating Facial", categoryName: "Facial", duration: 60, basePrice: 950 },
  { name: "Body Scrub", categoryName: "Body", duration: 50, basePrice: 800 },
  { name: "Brow Shaping", categoryName: "Beauty", duration: 20, basePrice: 220 },
  { name: "Relaxation Package", categoryName: "Package", duration: 90, basePrice: 1450 },
];

const makeupServices: DemoService[] = [
  { name: "Soft Glam", categoryName: "Makeup", duration: 60, basePrice: 900 },
  { name: "Bridal Trial", categoryName: "Bridal", duration: 90, basePrice: 1500 },
  { name: "Full Bridal Makeup", categoryName: "Bridal", duration: 120, basePrice: 2800 },
  { name: "Lash Application", categoryName: "Lashes", duration: 25, basePrice: 300 },
];

const nailServices: DemoService[] = [
  { name: "Classic Manicure", categoryName: "Manicure", duration: 35, basePrice: 320 },
  { name: "Gel Manicure", categoryName: "Manicure", duration: 50, basePrice: 520 },
  { name: "Classic Pedicure", categoryName: "Pedicure", duration: 45, basePrice: 430 },
  { name: "Nail Art Set", categoryName: "Art", duration: 60, basePrice: 750 },
];

const massageServices: DemoService[] = [
  { name: "Swedish Massage", categoryName: "Massage", duration: 60, basePrice: 900 },
  { name: "Deep Tissue Massage", categoryName: "Massage", duration: 75, basePrice: 1200 },
  { name: "Back and Neck Relief", categoryName: "Therapy", duration: 35, basePrice: 550 },
  { name: "Home Wellness Session", categoryName: "Mobile", duration: 90, basePrice: 1550 },
];

const demoBusinesses: DemoBusiness[] = [
  {
    slug: "bole-classic-cuts",
    name: "Bole Classic Cuts",
    type: "shop",
    categoryName: "Barber Shop",
    ownerName: "Mekdes Tesfaye",
    ownerEmail: "owner+bole-cuts@barberos.demo",
    password: "BoleCuts@2026",
    phoneNumber: "+251911200101",
    addressString: "Bole Medhanialem, Addis Ababa",
    latitude: 8.9955,
    longitude: 38.7893,
    description: "A polished neighborhood barbershop for clean fades, sharp beard work, and reliable walk-in grooming.",
    openingTime: "08:30",
    closingTime: "19:00",
    closedDays: [0],
    services: barberServices,
    staffNames: ["Dawit", "Nahom", "Samuel"],
  },
  {
    slug: "kazanchis-luxe-hair",
    name: "Kazanchis Luxe Hair Studio",
    type: "shop",
    categoryName: "Hair Salon",
    ownerName: "Liya Bekele",
    ownerEmail: "owner+kazanchis-luxe@barberos.demo",
    password: "LuxeHair@2026",
    phoneNumber: "+251911200102",
    addressString: "Kazanchis, Addis Ababa",
    latitude: 9.0184,
    longitude: 38.7637,
    description: "A calm hair studio for cuts, blowouts, color refreshes, silk press styling, and restorative treatments.",
    openingTime: "09:00",
    closingTime: "18:30",
    closedDays: [0],
    services: hairSalonServices,
    staffNames: ["Hanna", "Ruth", "Selam"],
  },
  {
    slug: "sarbet-serenity-spa",
    name: "Sarbet Serenity Spa",
    type: "shop",
    categoryName: "Beauty & Spa",
    ownerName: "Bethel Amanuel",
    ownerEmail: "owner+sarbet-serenity@barberos.demo",
    password: "Serenity@2026",
    phoneNumber: "+251911200103",
    addressString: "Sarbet, Addis Ababa",
    latitude: 8.9991,
    longitude: 38.7352,
    description: "A quiet spa destination for facials, body care, brow shaping, and high-touch beauty packages.",
    openingTime: "09:00",
    closingTime: "20:00",
    closedDays: [1],
    services: spaServices,
    staffNames: ["Mimi", "Saron", "Helen"],
  },
  {
    slug: "piassa-glow-makeup",
    name: "Piassa Glow Makeup Lounge",
    type: "shop",
    categoryName: "Makeup Artist",
    ownerName: "Sofia Girma",
    ownerEmail: "owner+piassa-glow@barberos.demo",
    password: "GlowMakeup@2026",
    phoneNumber: "+251911200104",
    addressString: "Piassa, Addis Ababa",
    latitude: 9.0369,
    longitude: 38.7522,
    description: "A makeup lounge specializing in event glam, bridal trials, lashes, and photo-ready finishing.",
    openingTime: "10:00",
    closingTime: "19:00",
    closedDays: [2],
    services: makeupServices,
    staffNames: ["Sofia", "Mahi"],
  },
  {
    slug: "summit-nile-nails",
    name: "Summit Nile Nail Bar",
    type: "shop",
    categoryName: "Nails",
    ownerName: "Rahel Tadesse",
    ownerEmail: "owner+summit-nails@barberos.demo",
    password: "NileNails@2026",
    phoneNumber: "+251911200105",
    addressString: "Summit, Addis Ababa",
    latitude: 8.9842,
    longitude: 38.8531,
    description: "A bright nail bar for classic manicures, gel finishes, pedicures, and expressive nail art.",
    openingTime: "09:30",
    closingTime: "19:30",
    closedDays: [0],
    services: nailServices,
    staffNames: ["Rahel", "Tigist"],
  },
  {
    slug: "megenagna-aroma-massage",
    name: "Megenagna Aroma Massage Studio",
    type: "shop",
    categoryName: "Massage",
    ownerName: "Abel Kebede",
    ownerEmail: "owner+aroma-massage@barberos.demo",
    password: "AromaMassage@2026",
    phoneNumber: "+251911200106",
    addressString: "Megenagna, Addis Ababa",
    latitude: 9.0203,
    longitude: 38.8028,
    description: "A focused massage studio for deep tissue relief, Swedish relaxation, and recovery sessions.",
    openingTime: "08:00",
    closingTime: "18:00",
    closedDays: [0],
    services: massageServices,
    staffNames: ["Abel", "Yared", "Biniam"],
  },
  {
    slug: "mexico-fresh-fade",
    name: "Mexico Fresh Fade House",
    type: "shop",
    categoryName: "Barber Shop",
    ownerName: "Biruk Alemu",
    ownerEmail: "owner+mexico-fade@barberos.demo",
    password: "FreshFade@2026",
    phoneNumber: "+251911200107",
    addressString: "Mexico Square, Addis Ababa",
    latitude: 9.0109,
    longitude: 38.7468,
    description: "A high-energy barber house for modern fades, lineups, beard sculpting, and quick grooming.",
    openingTime: "08:00",
    closingTime: "20:00",
    closedDays: [],
    services: barberServices,
    staffNames: ["Biruk", "Robel", "Henok"],
  },
  {
    slug: "22-urban-hair",
    name: "22 Urban Hair and Grooming",
    type: "shop",
    categoryName: "Hair Salon",
    ownerName: "Meron Assefa",
    ownerEmail: "owner+urban-hair@barberos.demo",
    password: "UrbanHair@2026",
    phoneNumber: "+251911200108",
    addressString: "Haya Hulet, Addis Ababa",
    latitude: 9.0162,
    longitude: 38.7891,
    description: "A hybrid salon and grooming studio with everyday cuts, blowouts, color, and barbering services.",
    openingTime: "09:00",
    closingTime: "19:00",
    closedDays: [0],
    services: [...hairSalonServices.slice(0, 3), ...barberServices.slice(0, 3)],
    staffNames: ["Meron", "Kalkidan", "Nahom"],
  },
  {
    slug: "amanuel-mobile-barber",
    name: "Amanuel Mobile Barber",
    type: "independent",
    categoryName: "Barber Shop",
    ownerName: "Amanuel Girma",
    ownerEmail: "owner+amanuel-mobile@barberos.demo",
    password: "Amanuel@2026",
    phoneNumber: "+251911200201",
    addressString: "Bole Atlas, Addis Ababa",
    latitude: 8.9987,
    longitude: 38.7839,
    description: "An independent mobile barber bringing clean cuts, fades, and beard trims to homes and offices.",
    openingTime: "09:00",
    closingTime: "18:00",
    closedDays: [0],
    services: barberServices.slice(0, 4),
    travel: { bufferRange: 5, travelRate: 180, minTravelFee: 120, maxTravelDistance: 18 },
  },
  {
    slug: "hana-bridal-beauty",
    name: "Hana Bridal Beauty",
    type: "independent",
    categoryName: "Makeup Artist",
    ownerName: "Hana Solomon",
    ownerEmail: "owner+hana-bridal@barberos.demo",
    password: "HanaBeauty@2026",
    phoneNumber: "+251911200202",
    addressString: "Old Airport, Addis Ababa",
    latitude: 8.9959,
    longitude: 38.7247,
    description: "A private makeup artist for soft glam, bridal makeup, lashes, and event-ready looks.",
    openingTime: "10:00",
    closingTime: "20:00",
    closedDays: [1],
    services: makeupServices,
    travel: { bufferRange: 7, travelRate: 220, minTravelFee: 150, maxTravelDistance: 22 },
  },
  {
    slug: "dawit-fade-specialist",
    name: "Dawit Fade Specialist",
    type: "independent",
    categoryName: "Barber Shop",
    ownerName: "Dawit Worku",
    ownerEmail: "owner+dawit-fade@barberos.demo",
    password: "DawitFade@2026",
    phoneNumber: "+251911200203",
    addressString: "CMC, Addis Ababa",
    latitude: 9.0068,
    longitude: 38.8701,
    description: "A precise independent barber known for fades, clean lineups, kids cuts, and beard detailing.",
    openingTime: "08:30",
    closingTime: "18:30",
    closedDays: [0],
    services: barberServices,
    travel: { bufferRange: 4, travelRate: 170, minTravelFee: 100, maxTravelDistance: 16 },
  },
  {
    slug: "selam-home-spa",
    name: "Selam Home Spa",
    type: "independent",
    categoryName: "Beauty & Spa",
    ownerName: "Selamawit Haile",
    ownerEmail: "owner+selam-spa@barberos.demo",
    password: "SelamSpa@2026",
    phoneNumber: "+251911200204",
    addressString: "Lebu, Addis Ababa",
    latitude: 8.9467,
    longitude: 38.7245,
    description: "A private home spa provider for facials, body care, and calm wellness treatments.",
    openingTime: "09:00",
    closingTime: "17:30",
    closedDays: [0, 6],
    services: spaServices.slice(0, 4),
    travel: { bufferRange: 6, travelRate: 200, minTravelFee: 130, maxTravelDistance: 20 },
  },
  {
    slug: "ruth-nail-artist",
    name: "Ruth Nail Artist",
    type: "independent",
    categoryName: "Nails",
    ownerName: "Ruth Alemayehu",
    ownerEmail: "owner+ruth-nails@barberos.demo",
    password: "RuthNails@2026",
    phoneNumber: "+251911200205",
    addressString: "Ayat, Addis Ababa",
    latitude: 9.0285,
    longitude: 38.8924,
    description: "An independent nail artist for gel manicures, pedicures, custom sets, and detailed nail art.",
    openingTime: "09:30",
    closingTime: "18:30",
    closedDays: [2],
    services: nailServices,
    travel: { bufferRange: 5, travelRate: 160, minTravelFee: 120, maxTravelDistance: 18 },
  },
  {
    slug: "bereket-massage-pro",
    name: "Bereket Massage Pro",
    type: "independent",
    categoryName: "Massage",
    ownerName: "Bereket Tola",
    ownerEmail: "owner+bereket-massage@barberos.demo",
    password: "Bereket@2026",
    phoneNumber: "+251911200206",
    addressString: "Gerji, Addis Ababa",
    latitude: 9.0115,
    longitude: 38.8197,
    description: "A mobile massage professional focused on deep tissue relief, recovery, and relaxation sessions.",
    openingTime: "08:00",
    closingTime: "18:00",
    closedDays: [0],
    services: massageServices,
    travel: { bufferRange: 8, travelRate: 210, minTravelFee: 150, maxTravelDistance: 24 },
  },
  {
    slug: "mariam-hair-stylist",
    name: "Mariam Hair Stylist",
    type: "independent",
    categoryName: "Hair Salon",
    ownerName: "Mariam Teshome",
    ownerEmail: "owner+mariam-hair@barberos.demo",
    password: "MariamHair@2026",
    phoneNumber: "+251911200207",
    addressString: "Gotera, Addis Ababa",
    latitude: 8.9849,
    longitude: 38.7588,
    description: "A private hair stylist for blowouts, silk press, conditioning, trims, and color maintenance.",
    openingTime: "09:00",
    closingTime: "19:00",
    closedDays: [0],
    services: hairSalonServices.slice(0, 5),
    travel: { bufferRange: 5, travelRate: 190, minTravelFee: 120, maxTravelDistance: 18 },
  },
  {
    slug: "yonatan-grooming",
    name: "Yonatan Grooming",
    type: "independent",
    categoryName: "Barber Shop",
    ownerName: "Yonatan Desta",
    ownerEmail: "owner+yonatan-grooming@barberos.demo",
    password: "Yonatan@2026",
    phoneNumber: "+251911200208",
    addressString: "Arat Kilo, Addis Ababa",
    latitude: 9.0352,
    longitude: 38.7614,
    description: "A solo grooming specialist for classic cuts, beard trims, office visits, and reliable upkeep.",
    openingTime: "08:30",
    closingTime: "18:00",
    closedDays: [5],
    services: barberServices.slice(0, 4),
    travel: { bufferRange: 6, travelRate: 180, minTravelFee: 110, maxTravelDistance: 20 },
  },
  // ── Extra shops ──────────────────────────────────────────────
  {
    slug: "cmc-edge-barbers",
    name: "CMC Edge Barbers",
    type: "shop",
    categoryName: "Barber Shop",
    ownerName: "Kidus Mekonnen",
    ownerEmail: "owner+cmc-edge@barberos.demo",
    password: "CmcEdge@2026",
    phoneNumber: "+251911200109",
    addressString: "CMC Michael, Addis Ababa",
    latitude: 9.0081,
    longitude: 38.8612,
    description: "Modern barbershop for fades, hot towel shaves, and weekday express grooming.",
    openingTime: "08:00",
    closingTime: "20:00",
    closedDays: [0],
    services: barberServices,
    staffNames: ["Kidus", "Abel", "Yonas", "Fikru"],
  },
  {
    slug: "lideta-silk-salon",
    name: "Lideta Silk Salon",
    type: "shop",
    categoryName: "Hair Salon",
    ownerName: "Hiwot Alemu",
    ownerEmail: "owner+lideta-silk@barberos.demo",
    password: "LidetaSilk@2026",
    phoneNumber: "+251911200110",
    addressString: "Lideta, Addis Ababa",
    latitude: 9.0124,
    longitude: 38.7411,
    description: "Full-service salon for silk press, color, and restorative hair treatments.",
    openingTime: "09:00",
    closingTime: "19:00",
    closedDays: [0],
    services: hairSalonServices,
    staffNames: ["Hiwot", "Beti", "Sena"],
  },
  {
    slug: "gerji-petal-spa",
    name: "Gerji Petal Spa",
    type: "shop",
    categoryName: "Beauty & Spa",
    ownerName: "Nardos Hailu",
    ownerEmail: "owner+gerji-petal@barberos.demo",
    password: "PetalSpa@2026",
    phoneNumber: "+251911200111",
    addressString: "Gerji Mebrat Hail, Addis Ababa",
    latitude: 9.0142,
    longitude: 38.8255,
    description: "Neighborhood spa for facials, brow shaping, and weekend wellness packages.",
    openingTime: "10:00",
    closingTime: "20:00",
    closedDays: [1],
    services: spaServices,
    staffNames: ["Nardos", "Lulit", "Marta"],
  },
  {
    slug: "ayat-polish-lab",
    name: "Ayat Polish Lab",
    type: "shop",
    categoryName: "Nails",
    ownerName: "Tsehay Bekele",
    ownerEmail: "owner+ayat-polish@barberos.demo",
    password: "AyatPolish@2026",
    phoneNumber: "+251911200112",
    addressString: "Ayat Real Estate, Addis Ababa",
    latitude: 9.0312,
    longitude: 38.9011,
    description: "Nail lab for gel sets, art, and express pedicures near Ayat.",
    openingTime: "09:30",
    closingTime: "19:00",
    closedDays: [0],
    services: nailServices,
    staffNames: ["Tsehay", "Blen", "Hana"],
  },
  // ── Extra independents (some without main image) ─────────────
  {
    slug: "fikru-mobile-cuts",
    name: "Fikru Mobile Cuts",
    type: "independent",
    categoryName: "Barber Shop",
    ownerName: "Fikru Assefa",
    ownerEmail: "owner+fikru-mobile@barberos.demo",
    password: "FikruCuts@2026",
    phoneNumber: "+251911200209",
    addressString: "Bole Brass, Addis Ababa",
    latitude: 8.9921,
    longitude: 38.7912,
    description: "Mobile barber for home fades and office touch-ups around Bole.",
    openingTime: "09:00",
    closingTime: "18:00",
    closedDays: [0],
    services: barberServices.slice(0, 4),
    omitMainImage: true,
    travel: { bufferRange: 5, travelRate: 175, minTravelFee: 110, maxTravelDistance: 17 },
  },
  {
    slug: "betty-glam-on-call",
    name: "Betty Glam On Call",
    type: "independent",
    categoryName: "Makeup Artist",
    ownerName: "Betty Workneh",
    ownerEmail: "owner+betty-glam@barberos.demo",
    password: "BettyGlam@2026",
    phoneNumber: "+251911200210",
    addressString: "Saris, Addis Ababa",
    latitude: 8.9612,
    longitude: 38.7689,
    description: "On-call glam artist for soft glam, lashes, and event makeup.",
    openingTime: "10:00",
    closingTime: "20:00",
    closedDays: [1],
    services: makeupServices,
    omitMainImage: true,
    travel: { bufferRange: 7, travelRate: 230, minTravelFee: 160, maxTravelDistance: 22 },
  },
  {
    slug: "teddy-deep-tissue",
    name: "Teddy Deep Tissue",
    type: "independent",
    categoryName: "Massage",
    ownerName: "Teddy Lemma",
    ownerEmail: "owner+teddy-massage@barberos.demo",
    password: "TeddyMassage@2026",
    phoneNumber: "+251911200211",
    addressString: "Jemo, Addis Ababa",
    latitude: 8.9522,
    longitude: 38.7124,
    description: "Independent therapist for deep tissue and back-neck recovery sessions.",
    openingTime: "08:00",
    closingTime: "17:30",
    closedDays: [0],
    services: massageServices,
    omitMainImage: true,
    travel: { bufferRange: 8, travelRate: 200, minTravelFee: 140, maxTravelDistance: 23 },
  },
  {
    slug: "lidiya-nail-van",
    name: "Lidiya Nail Van",
    type: "independent",
    categoryName: "Nails",
    ownerName: "Lidiya Kebede",
    ownerEmail: "owner+lidiya-nails@barberos.demo",
    password: "LidiyaNails@2026",
    phoneNumber: "+251911200212",
    addressString: "Kality, Addis Ababa",
    latitude: 8.9411,
    longitude: 38.7788,
    description: "Mobile nail artist for gel manicures and custom art at home.",
    openingTime: "09:30",
    closingTime: "18:00",
    closedDays: [2],
    services: nailServices,
    omitMainImage: true,
    travel: { bufferRange: 6, travelRate: 165, minTravelFee: 120, maxTravelDistance: 19 },
  },
];

const connect = async (): Promise<void> => {
  const rawUri = process.env.MONGO_URI;
  if (!rawUri) throw new Error("MONGO_URI is not defined");
  await mongoose.connect(rawUri);
};

const initializeFirebaseIfAvailable = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase Admin env is missing. PDF passwords are not Firebase login passwords yet.");
    return;
  }

  try {
    initializeFirebaseAdmin({ projectId, clientEmail, privateKey });
    firebaseReady = true;
  } catch (error) {
    console.warn("Firebase Admin initialization failed. Continuing with local dev users only.");
  }
};

const slugUid = (kind: string, slug: string, suffix?: string) =>
  [DEMO_PREFIX, kind, slug, suffix].filter(Boolean).join("-");

const publicUploadPath = (filename: string): string =>
  `/uploads/demo-marketplace/${filename}`;

const copyDemoImages = (): string[] => {
  const sourceDir = path.resolve(process.cwd(), "..", "images");
  const destinationDir = path.resolve(process.cwd(), "uploads", "demo-marketplace");
  fs.mkdirSync(destinationDir, { recursive: true });

  return imageFiles.map((filename) => {
    const source = path.join(sourceDir, filename);
    const destination = path.join(destinationDir, filename);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, destination);
    }
    return publicUploadPath(filename);
  });
};

const weeklySchedule = (open: string, close: string, closedDays: number[] = []) =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: !closedDays.includes(dayOfWeek),
    openingTime: closedDays.includes(dayOfWeek) ? undefined : open,
    closingTime: closedDays.includes(dayOfWeek) ? undefined : close,
  }));

const upsertCategory = async (name: string) => {
  return Category.findOneAndUpdate(
    { name },
    { $set: { name, isActive: true } },
    { upsert: true, returnDocument: "after" },
  );
};

const cleanupDemoData = async () => {
  const demoUsers = await User.find({
    firebaseUid: new RegExp(`^${DEMO_PREFIX}-`),
  }).select("_id firebaseUid");
  const userIds = demoUsers.map((user) => user._id);
  const firebaseUids = demoUsers.map((user) => user.firebaseUid);
  const businesses = await Business.find({ ownerId: { $in: userIds } }).select("_id");
  const businessIds = businesses.map((business) => business._id);

  await Promise.all([
    Booking.deleteMany({ businessId: { $in: businessIds } }),
    Client.deleteMany({ businessId: { $in: businessIds } }),
    Product.deleteMany({ businessId: { $in: businessIds } }),
    Service.deleteMany({ businessId: { $in: businessIds } }),
    StaffProfile.deleteMany({ businessId: { $in: businessIds } }),
    Availability.deleteMany({ staffId: { $in: firebaseUids } }),
  ]);
  await Business.deleteMany({ _id: { $in: businessIds } });
  await User.deleteMany({ _id: { $in: userIds } });
};

const createUser = async (input: {
  firebaseUid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  roles: Array<"customer" | "staff" | "owner">;
  profilePicture?: string;
  password?: string;
}) => {
  if (firebaseReady && input.password) {
    const admin = getFirebaseAdmin();
    try {
      const existing = await admin.auth().getUserByEmail(input.email);
      await admin.auth().updateUser(existing.uid, {
        password: input.password,
        displayName: input.fullName,
        disabled: false,
      });
    } catch {
      await admin.auth().createUser({
        uid: input.firebaseUid,
        email: input.email,
        password: input.password,
        displayName: input.fullName,
        emailVerified: true,
        disabled: false,
      });
    }
  }

  return User.create({
    ...input,
    isVerified: true,
    needsPasswordReset: false,
  });
};

const createAvailability = async (
  staffId: string,
  schedule: ReturnType<typeof weeklySchedule>,
) => {
  const rows = schedule
    .filter((entry) => entry.isOpen && entry.openingTime && entry.closingTime)
    .map((entry) => ({
      staffId,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.openingTime,
      endTime: entry.closingTime,
    }));

  if (rows.length) await Availability.insertMany(rows);
};

const createClientsAndBookings = async (input: {
  businessId: Types.ObjectId;
  staffId: string;
  serviceIds: Types.ObjectId[];
  customerIds: string[];
}) => {
  const clients = await Client.insertMany([
    {
      businessId: input.businessId,
      fullName: "Aster Demo",
      phoneNumber: "+251922300001",
      email: "aster.demo@example.com",
      totalSpend: 900,
      lastVisit: new Date(),
    },
    {
      businessId: input.businessId,
      fullName: "Kaleb Demo",
      phoneNumber: "+251922300002",
      email: "kaleb.demo@example.com",
      totalSpend: 1250,
      lastVisit: new Date(),
    },
    {
      businessId: input.businessId,
      fullName: "Sara Demo",
      phoneNumber: "+251922300003",
      email: "sara.demo@example.com",
      totalSpend: 700,
      lastVisit: new Date(),
    },
    {
      businessId: input.businessId,
      fullName: "Yonas Demo",
      phoneNumber: "+251922300004",
      email: "yonas.demo@example.com",
      totalSpend: 1100,
      lastVisit: new Date(),
    },
    {
      businessId: input.businessId,
      fullName: "Marta Demo",
      phoneNumber: "+251922300005",
      email: "marta.demo@example.com",
      totalSpend: 860,
      lastVisit: new Date(),
    },
  ]);

  const base = new Date();
  base.setHours(10, 0, 0, 0);
  const bookings = [0, 1, 2, 3, 4, 5].map((index) => {
    const dayOffset = Math.floor(index / 2);
    const startTime = new Date(
      base.getTime() + dayOffset * 24 * 60 * 60 * 1000 + (index % 2) * 2 * 60 * 60 * 1000,
    );
    const endTime = new Date(startTime.getTime() + 45 * 60 * 1000);
    const serviceId = input.serviceIds[index % input.serviceIds.length];
    const statuses = ["confirmed", "pending", "confirmed", "pending", "confirmed", "confirmed"] as const;
    const status = statuses[index];
    return {
      userId: input.customerIds[index % input.customerIds.length],
      businessId: input.businessId,
      clientId: clients[index % clients.length]._id,
      staffId: input.staffId,
      serviceIds: [serviceId],
      serviceId,
      staffPlan: [{ staffId: input.staffId, serviceId, startTime, endTime }],
      startTime,
      endTime,
      totalAmount: 300 + index * 120,
      status,
      paymentMethod: index % 2 === 0 ? "chapa" : "cash",
      paymentStatus: status === "pending" ? "unpaid" : "paid",
      paidAt: status === "pending" ? undefined : new Date(),
    };
  });
  await Booking.insertMany(bookings);
};

const textEscape = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrapText = (value: string, max = 88): string[] => {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const generatePdf = (rows: CredentialRow[], outputPath: string) => {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const pages: string[] = [];
  let content = "";
  let y = pageHeight - margin;

  const newPage = () => {
    if (content) pages.push(content);
    content = "BT\n/F1 10 Tf\n";
    y = pageHeight - margin;
  };

  const line = (text: string, size = 10, indent = 0) => {
    if (y < margin + 24) newPage();
    content += `/F1 ${size} Tf\n1 0 0 1 ${margin + indent} ${y} Tm (${textEscape(text)}) Tj\n`;
    y -= size + 5;
  };

  newPage();
  line("Barber OS Demo Marketplace Credentials", 18);
  line(`Generated: ${new Date().toLocaleString()}`, 10);
  line("Auth note: local DB users are seeded. Use firebaseUid/dev header in dev mode, or create matching Firebase users for password login.", 9);
  y -= 8;

  for (const row of rows) {
    if (y < 170) newPage();
    line(`${row.businessName} (${row.type})`, 14);
    line(`Category: ${row.categoryName}`);
    line(`Owner: ${row.ownerName}`);
    line(`Email: ${row.ownerEmail}`);
    line(`Password: ${row.password}`);
    line(`Firebase UID / Dev Header: ${row.devHeader}`);
    line(`Address: ${row.addressString}`);
    line(`Hours: ${row.hours}`);
    for (const wrapped of wrapText(`Services: ${row.services}`, 96)) line(wrapped);
    for (const wrapped of wrapText(`About: ${row.description}`, 96)) line(wrapped);
    y -= 8;
  }
  pages.push(content);

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (const page of pages) {
    const stream = `${page}ET`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    const pageId = addObject("");
    pageIds.push(pageId);
  }
  const pagesId = addObject("");
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  for (let i = 0; i < pageIds.length; i += 1) {
    objects[pageIds[i] - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`;
  }
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, pdf, "binary");
};

const main = async () => {
  initializeFirebaseIfAvailable();
  await connect();
  await cleanupDemoData();

  const imagePaths = copyDemoImages();
  const categoryDocs = new Map<string, Awaited<ReturnType<typeof upsertCategory>>>();
  for (const name of categories) {
    categoryDocs.set(name, await upsertCategory(name));
  }

  const customers = await Promise.all(
    [
      "Lensa Demo Customer",
      "Noah Demo Customer",
      "Maya Demo Customer",
      "Abel Demo Customer",
      "Hanna Demo Customer",
    ].map((name, index) =>
      createUser({
        firebaseUid: slugUid("customer", String(index + 1)),
        fullName: name,
        email: `customer${index + 1}@barberos.demo`,
        phoneNumber: `+25193340000${index + 1}`,
        roles: ["customer"],
      }),
    ),
  );

  const credentials: CredentialRow[] = [];

  for (let index = 0; index < demoBusinesses.length; index += 1) {
    const demo = demoBusinesses[index];
    const ownerUid = slugUid("owner", demo.slug);
    const logo = demo.omitMainImage ? "" : imagePaths[index % imagePaths.length];
    const cover = demo.omitMainImage
      ? ""
      : imagePaths[(index + 3) % imagePaths.length];
    const gallery = [
      imagePaths[index % imagePaths.length],
      imagePaths[(index + 2) % imagePaths.length],
      imagePaths[(index + 5) % imagePaths.length],
      imagePaths[(index + 7) % imagePaths.length],
      imagePaths[(index + 9) % imagePaths.length],
    ];
    const category = categoryDocs.get(demo.categoryName);
    if (!category) throw new Error(`Missing category ${demo.categoryName}`);

    const owner = await createUser({
      firebaseUid: ownerUid,
      fullName: demo.ownerName,
      email: demo.ownerEmail,
      phoneNumber: demo.phoneNumber,
      roles: ["owner"],
      profilePicture: logo || imagePaths[(index + 1) % imagePaths.length],
      password: demo.password || DEFAULT_PASSWORD,
    });

    const schedule = weeklySchedule(demo.openingTime, demo.closingTime, demo.closedDays || []);
    const business = await Business.create({
      name: demo.name,
      ownerId: owner._id,
      type: demo.type,
      businessCategoryId: category._id,
      businessCategoryName: category.name,
      location: { type: "Point", coordinates: [demo.longitude, demo.latitude] },
      homeLocation: { type: "Point", coordinates: [demo.longitude, demo.latitude] },
      addressString: demo.addressString,
      description: demo.description,
      logoUrl: logo || undefined,
      coverImageUrl: cover || undefined,
      galleryUrls: gallery,
      mediaLinks: gallery,
      tiktokUrls: [],
      averagePrice: Math.round(
        demo.services.reduce((sum, service) => sum + service.basePrice, 0) /
          demo.services.length,
      ),
      openingTime: demo.openingTime,
      closingTime: demo.closingTime,
      weeklySchedule: schedule,
      verificationStatus: "active",
      isVisible: true,
      productsEnabled: demo.type === "shop",
      genderTarget: "unknown",
      slotInterval: 15,
      cancellationWindowMinutes: 120,
      ...(demo.travel || {}),
    });

    const serviceDocs = await Service.insertMany(
      demo.services.map((service, serviceIndex) => ({
        businessId: business._id,
        name: service.name,
        category: service.categoryName.toLowerCase(),
        categoryName: service.categoryName,
        duration: service.duration,
        basePrice: service.basePrice,
        sortOrder: serviceIndex,
      })),
    );

    if (demo.type === "shop") {
      const productImage = gallery[0] || cover || logo || "";
      await Product.insertMany(
        [
          {
            name: "Shiseido Perfume",
            brand: "Shiseido",
            category: "Fragrances",
            description:
              "A luxurious fragrance crafted with natural and moisturizing ingredients. Long-lasting scent that keeps you fresh throughout the day. Suitable for all skin types.",
            imageUrl: productImage,
            price: 450,
            stockQuantity: 24,
            minStockAlert: 4,
            ratingAverage: 0,
            ratingCount: 0,
          },
          {
            name: "Aftercare Oil",
            brand: demo.name,
            category: "Hair Care",
            description: "Lightweight finishing oil for shine and soft hold.",
            imageUrl: gallery[1] || productImage,
            price: 380,
            stockQuantity: 20,
            minStockAlert: 4,
          },
          {
            name: "Style Cream",
            brand: demo.name,
            category: "Styling",
            description: "Medium-hold cream for everyday styles.",
            imageUrl: gallery[2] || productImage,
            price: 420,
            stockQuantity: 16,
            minStockAlert: 4,
          },
        ].map((product) => ({ ...product, businessId: business._id, isActive: true })),
      );
    }

    const staffNames =
      demo.type === "independent" ? [demo.ownerName] : demo.staffNames || [demo.ownerName];
    const staffIds: string[] = [];
    for (let staffIndex = 0; staffIndex < staffNames.length; staffIndex += 1) {
      const fullName = staffNames[staffIndex];
      const staffUid =
        demo.type === "independent"
          ? ownerUid
          : slugUid("staff", demo.slug, String(staffIndex + 1));
      staffIds.push(staffUid);

      if (demo.type !== "independent") {
        await createUser({
          firebaseUid: staffUid,
          fullName: `${fullName} ${demo.name.split(" ")[0]}`,
          email: `staff+${demo.slug}-${staffIndex + 1}@barberos.demo`,
          phoneNumber: `+251944${String(index + 1).padStart(2, "0")}${String(staffIndex + 1).padStart(4, "0")}`,
          roles: ["staff"],
          profilePicture: imagePaths[(index + staffIndex + 2) % imagePaths.length],
        });
      }

      await StaffProfile.create({
        staffId: staffUid,
        businessId: business._id,
        firstName: fullName.split(" ")[0],
        lastName: fullName.split(" ").slice(1).join(" "),
        email:
          demo.type === "independent"
            ? demo.ownerEmail
            : `staff+${demo.slug}-${staffIndex + 1}@barberos.demo`,
        role: demo.type === "independent" ? "Independent Owner" : "Professional",
        permissionLevel: staffIndex === 0 ? "high" : "medium",
        hourlyWage: demo.type === "independent" ? 0 : 80 + staffIndex * 20,
        serviceCommission: { type: "fixed", value: demo.type === "independent" ? 100 : 15 },
        productCommission: demo.type === "independent" ? 100 : 10,
        biography: `${fullName} is part of ${demo.name}, focused on ${demo.categoryName.toLowerCase()} services and reliable customer care.`,
        profilePicture: imagePaths[(index + staffIndex + 1) % imagePaths.length],
        isBookableInCalendar: true,
        services: serviceDocs.map((service) => service._id),
        specialties: [...new Set(demo.services.map((service) => service.categoryName))],
        isActive: true,
        isOnlineVisible: true,
      });
      await createAvailability(staffUid, schedule);
    }

    await createClientsAndBookings({
      businessId: business._id,
      staffId: staffIds[0],
      serviceIds: serviceDocs.map((service) => service._id),
      customerIds: customers.map((customer) => String(customer._id)),
    });

    credentials.push({
      businessName: demo.name,
      type: demo.type,
      categoryName: demo.categoryName,
      ownerName: demo.ownerName,
      ownerEmail: demo.ownerEmail,
      password: demo.password || DEFAULT_PASSWORD,
      firebaseUid: ownerUid,
      devHeader: ownerUid,
      addressString: demo.addressString,
      hours: `${demo.openingTime} - ${demo.closingTime}`,
      services: demo.services.map((service) => service.name).join(", "),
      description: demo.description,
    });
  }

  const outputDir = path.resolve(process.cwd(), "demo-output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "demo-marketplace-credentials.json"),
    JSON.stringify(credentials, null, 2),
    "utf8",
  );
  generatePdf(credentials, path.join(outputDir, "demo-marketplace-credentials.pdf"));

  console.log(`Seeded ${demoBusinesses.length} demo businesses.`);
  console.log(`Images copied to uploads/demo-marketplace.`);
  console.log(`Credentials PDF: ${path.join(outputDir, "demo-marketplace-credentials.pdf")}`);
  console.log(`Credentials JSON: ${path.join(outputDir, "demo-marketplace-credentials.json")}`);
};

main()
  .catch((error) => {
    console.error("Demo marketplace seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
