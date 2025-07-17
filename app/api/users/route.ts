import { query, queryOne } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Execute a query to fetch users
    const users = await query(`
      SELECT id, name, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `)

    return NextResponse.json({
      success: true,
      data: users,
      count: users.length,
    })
  } catch (error) {
    console.error("Database query error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email } = body

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    // Insert new user and return the created record
    const newUser = await queryOne(
      `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at`,
      [name, email]
    )

    if (!newUser) {
      throw new Error("Failed to create user")
    }

    return NextResponse.json(
      {
        success: true,
        data: newUser,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Database insert error:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}