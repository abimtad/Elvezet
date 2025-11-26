import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  try {
    const rawUri = process.env.MONGO_URI;

    if (!rawUri) {
      throw new Error("MONGO_URI is not defined in environment variables.");
    }

    // Replace placeholders safely
    const mongoUri = rawUri
      .replace("<db_username>", process.env.MONGO_USER || "")
      .replace("<db_password>", process.env.MONGO_PASSWORD || "");

    mongoose.set("strictQuery", true);

    // Add a listener for connection errors after the initial connection
    mongoose.connection.on("error", () => {
      console.error("MongoDB connection error. Check database availability, credentials and network access.");
    });

    await mongoose.connect(mongoUri);

    console.log("âœ… Connected to MongoDB Atlas");
  } catch {
    // Driver errors can include connection strings and credentials; never log them.
    console.error("Database connection failed. Check MONGO_URI, credentials and network access.");
    // Optional: Exit the process if the DB is critical for the app to start
    process.exit(1);
  }
};
