import { Request, Response } from "express";
import { getClient } from "../utils/initDB";

const getJobs = async (req: Request, res: Response) => {
  try {
    const prisma = getClient();
    const jobs = await prisma.job.findMany();
    res.status(200).json({
      data: jobs,
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
};

const swapJob = async (req: Request, res: Response) => {};

const jobController = {
    getJobs,
    swapJob,
}

export default jobController;