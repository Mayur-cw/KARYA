import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/server/app";
import {
  initDatabase,
  getDb,
  WorkflowRepository,
} from "../../src/server/repository";
import { seedPresentation } from "../../src/server/presentation-seed";
import { SEEDED_USERS } from "../../src/server/session";

describe("Dashboard and directory resources", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), "karya-experience-"));
    vi.stubEnv("ATTACHMENT_STORAGE_DIR", directory);
    initDatabase(":memory:");
    seedPresentation(getDb(), {
      ...process.env,
      DEMO_MODE: "true",
      DEMO_SEED: "true",
    });
  });
  afterEach(() => {
    getDb().close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  async function client(index = 0) {
    const app = createApp();
    const login = await request(app)
      .post("/api/session")
      .send({ userId: SEEDED_USERS[index]!.id });
    return { app, cookie: login.headers["set-cookie"] };
  }
  it("aggregates actual records without returning entire collections", async () => {
    const { app, cookie } = await client();
    const result = await request(app)
      .get("/api/dashboard")
      .set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.counts).toMatchObject({
      total: 6,
      published: 4,
      drafts: 1,
      archived: 1,
      needsAttention: 1,
      awaitingReview: 3,
    });
    expect(result.body.recent).toHaveLength(5);
    expect(result.body.attention).toHaveLength(1);
    expect(result.body.attention[0].title).toContain("Advanced Lab");
    expect(result.headers["cache-control"]).toBe("no-store");
  });
  it.each([1, 3])(
    "keeps administrator aggregates private from account %i",
    async (index) => {
      const { app, cookie } = await client(index);
      expect(
        (await request(app).get("/api/dashboard").set("Cookie", cookie)).status,
      ).toBe(403);
    },
  );
  it("searches and sorts before limiting the workflow result", async () => {
    const { app, cookie } = await client();
    const result = await request(app)
      .get("/api/workflows?sort=title_asc&limit=2")
      .set("Cookie", cookie);
    expect(result.body.total).toBe(6);
    expect(
      result.body.items.map((item: { title: string }) => item.title),
    ).toEqual([
      "Advanced Lab Access · Demo",
      "Campus Research Showcase · Demo",
    ]);
    const deadlines = await request(app)
      .get("/api/workflows?sort=deadline_asc&limit=50")
      .set("Cookie", cookie);
    expect(deadlines.body.items.at(-1).deadline).toBeNull();
    const found = await request(app)
      .get("/api/workflows?q=Research%20Ethics&limit=1")
      .set("Cookie", cookie);
    expect(found.body.total).toBe(1);
    expect(found.body.items[0].title).toContain("Research Ethics");
  });
  it("returns unique latest-version assignments with stable database pagination", async () => {
    const { app, cookie } = await client();
    const first = await request(app)
      .get("/api/assignments?limit=3&page=1")
      .set("Cookie", cookie);
    const second = await request(app)
      .get("/api/assignments?limit=3&page=2")
      .set("Cookie", cookie);
    expect(first.body.total).toBe(10);
    expect(first.body.items).toHaveLength(3);
    expect(
      first.body.items.some((item: { id: string }) =>
        second.body.items.some((other: { id: string }) => other.id === item.id),
      ),
    ).toBe(false);
    expect(first.body.items[0].workflowTitle).toBeTruthy();
  });
  it("keeps student directory scope intact while filtering assignments", async () => {
    const { app, cookie } = await client(1);
    const result = await request(app)
      .get("/api/assignments?limit=50")
      .set("Cookie", cookie);
    expect(result.body.total).toBe(5);
    expect(
      result.body.items.every(
        (item: { studentId: string }) => item.studentId === SEEDED_USERS[1]!.id,
      ),
    ).toBe(true);
    expect(
      (await request(app).get("/api/users").set("Cookie", cookie)).status,
    ).toBe(403);
  });
  it("filters and counts users before database pagination", async () => {
    const { app, cookie } = await client();
    const result = await request(app)
      .get("/api/users?role=student&q=aarav&limit=1")
      .set("Cookie", cookie);
    expect(result.body.total).toBe(1);
    expect(result.body.items[0].name).toContain("Aarav");
    expect(result.body.items[0].active).toBe(true);
  });
  it("finds blocked drafts even when many newer drafts are ready", async () => {
    const { app, cookie } = await client();
    const repo = new WorkflowRepository(getDb());
    const source = repo.listByDepartment(SEEDED_USERS[0]!.departmentId)[0]!;
    for (let index = 0; index < 55; index++)
      repo.create({
        ...source,
        id: crypto.randomUUID(),
        status: "draft",
        uncertainties: [],
        fields: source.fields,
        stages: [
          { stageIndex: 0, label: "Review", reviewerId: SEEDED_USERS[3]!.id },
        ],
        deadline: new Date(Date.now() + 86400000).toISOString(),
        version: 1,
        updatedAt: new Date().toISOString(),
      });
    const result = await request(app)
      .get("/api/dashboard")
      .set("Cookie", cookie);
    expect(result.body.counts.total).toBe(61);
    expect(result.body.counts.needsAttention).toBe(1);
    expect(result.body.attention[0].title).toContain("Advanced Lab");
  });
});
