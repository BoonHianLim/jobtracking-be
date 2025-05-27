import { PrismaClient } from "../generated/prisma";

let prisma: PrismaClient | undefined;

export const initDB = () => {
  prisma = new PrismaClient();
  prisma.$connect();
  console.log("Prisma client initialized and connected to the database");
};

export const getClient = (): PrismaClient => {
  if (!prisma) {
    initDB();
  }
  if (!prisma) {
    throw new Error("Prisma client initialization failed");
  }
  return prisma;
};
