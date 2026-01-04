import { model, Schema } from 'mongoose';
const schema = new Schema({ actor: String, key: String, businessId: { type: Schema.Types.ObjectId, ref: 'Business' }, body: Schema.Types.Mixed, error: String, state: { type: String, default: 'open' }, resolvedBookingId: Schema.Types.ObjectId, expireAt: Date }, { timestamps: true });
schema.index({ actor: 1, key: 1 }, { unique: true });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
export default model('OfflineConflict', schema);
