import { Document, model, Schema, Types } from "mongoose";

export interface ITenantRole extends Document {
  businessId: Types.ObjectId;
  name: string;
}

const tenantRoleSchema = new Schema<ITenantRole>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

tenantRoleSchema.index({ businessId: 1, name: 1 }, { unique: true });

export default model<ITenantRole>("TenantRole", tenantRoleSchema);
