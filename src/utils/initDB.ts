import { PrismaClient } from "../generated/prisma";

let prisma: PrismaClient;

export const initDB = () => {
  prisma = new PrismaClient();
  prisma.$connect();
};

export const getClient = (): PrismaClient => {
  if (!prisma) {
    initDB();
  }
  return prisma;
};
