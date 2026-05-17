import { Request, Response, NextFunction } from "express";
import {
  createDiscoverVideo,
  deleteDiscoverVideo,
  getDiscoverCategories,
  getDiscoverVideoById,
  listAdminDiscoverVideos,
  listPublicDiscoverVideos,
  updateDiscoverVideo,
} from "../services/discover.service";

export const listPublicDiscoverVideosController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;
    res.json({
      categories: await getDiscoverCategories(),
      videos: await listPublicDiscoverVideos(category),
    });
  } catch (error) {
    next(error);
  }
};

export const getDiscoverVideoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await getDiscoverVideoById(String(req.params.id)));
  } catch (error) {
    next(error);
  }
};

export const listAdminDiscoverVideosController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({
      categories: await getDiscoverCategories(),
      videos: await listAdminDiscoverVideos(),
    });
  } catch (error) {
    next(error);
  }
};

export const createDiscoverVideoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const video = await createDiscoverVideo(req.body);
    res.status(201).json(video);
  } catch (error) {
    next(error);
  }
};

export const updateDiscoverVideoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await updateDiscoverVideo(String(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
};

export const deleteDiscoverVideoController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await deleteDiscoverVideo(String(req.params.id)));
  } catch (error) {
    next(error);
  }
};
