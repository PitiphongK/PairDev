import { PatchSessionRequest } from "@/interfaces/session";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params } : { params: Promise<{ id: string}>}
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body: PatchSessionRequest = await request.json()
    const { code, language, strokes } = body
    await prisma.session.update({
      where: { id },
      data: { code, language, strokes },
    })
    return NextResponse.json(
      {
        success: true,
        message: "Session information updated",
      },
      { status: 200 }
    )
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error'}, { status: 500 })
  }
}