import { Prisma } from '@/generated/prisma'
import { CreateSessionRequest } from '@/interfaces/session'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse, type NextRequest } from 'next/server'
import { generateSessionName } from '@/utils/session'

// POST: api/session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body : CreateSessionRequest = await request.json()
    const { roomId } = body
    const existingUserSession = await prisma.userSession.findFirst({
      where: { 
        userId: session.user.id,
        session: { roomId }
      },
      include: { session: true }
    })
    if (existingUserSession) {
      return NextResponse.json(
        { success: true, message: "UserSession already exists", session: existingUserSession.session },
        { status: 200 }
      )
    }

    const existingSession = await prisma.session.findFirst({
      where: { roomId }
    })
    if (existingSession) {
      await prisma.userSession.create({
        data: {
          userId: session.user.id,
          sessionId: existingSession.id,
          isOwner: false,
        }
      })
      return NextResponse.json(
        { success: true, message: "Created UserSession for existing Session", session: existingSession },
        { status: 201 }
      )
    }

    const { code, language, strokes } = body
    const prismaSession = await prisma.session.create({
      data: {
        roomId,
        name: generateSessionName(),
        code,
        language,
        strokes: strokes ?? [],
      }
    })
    await prisma.userSession.create({
      data: {
        userId: session.user.id,
        sessionId: prismaSession.id,
        isOwner: true,
      }
    })
    return NextResponse.json(
      { success: true, message: "Created new Session and UserSession", session: prismaSession },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/sessions error:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: `DB error: ${error.code}` }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}