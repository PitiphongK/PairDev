import { Prisma } from "@/generated/prisma";

export interface CreateSessionRequest {
  roomId: string
  code: string
  language: string
  strokes: Prisma.InputJsonValue
}

export interface PatchSessionRequest {
  code: string
  language: string
  strokes: Prisma.InputJsonValue
}