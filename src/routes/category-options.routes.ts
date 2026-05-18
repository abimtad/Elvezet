import { Router } from "express";
import Joi from "joi";
import authMiddleware from "../middlewares/auth.middleware";
import ApiError from "../utils/ApiError";
import { CategoryOptionsQuery, listCategoryOptions } from "../services/category-options.service";

export const categoryOptionsSchema = Joi.object({
  kind: Joi.string().valid("business", "service", "product", "specialty", "discover").required(),
  businessId: Joi.string().pattern(/^[a-f\d]{24}$/i).when("kind", {
    is: Joi.valid("service", "product", "specialty"), then: Joi.required(), otherwise: Joi.forbidden(),
  }),
  q: Joi.string().trim().max(100).allow("").default(""),
  limit: Joi.number().integer().min(1).max(100).default(30),
}).unknown(false);

const router = Router();
router.get("/category-options", authMiddleware, async (req, res, next) => {
  try {
    const { error, value } = categoryOptionsSchema.validate(req.query);
    if (error) throw new ApiError(400, "Invalid category options query", error.details.map(detail => detail.message));
    const data = await listCategoryOptions(req.user!, value as CategoryOptionsQuery);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) { next(error); }
});
export default router;
