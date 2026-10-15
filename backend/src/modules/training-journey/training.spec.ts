import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import { TrainingService } from "./training.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { MemberJwtUser } from "../../common/types/member-jwt-user";
import * as D from "./training-domain";
import { TrainingAdminController } from "./training.controller";
import { REQUIRES_PERMISSION_KEY } from "../../common/decorators/requires-permission.decorator";
const admin = { sub: 1, branch: 10, level: 1, is_trainer: false } as JwtUser;
const member = {
  sub: 5,
  memberId: 1,
  branchId: 10,
  type: "member",
} as MemberJwtUser;
describe("Body measurements validation", () => {
  it("rejects unknown fields, empty values, unreasonable inputs and height targets", () => {
    expect(() => D.bodyMeasurements({})).toThrow();
    expect(() => D.bodyMeasurements({ weight: -4 })).toThrow();
    expect(() => D.bodyMeasurements({ waist: Number.NaN })).toThrow();
    expect(() => D.bodyMeasurements({ weight: true })).toThrow();
    expect(() => D.bodyMeasurements({ fatPercentage: 20 })).toThrow();
    expect(() => D.bodyMeasurements({ height: 175 }, true)).toThrow();
    expect(D.bodyMeasurements({ height: 175, waist: 82.34 })).toEqual({
      height: 175,
      waist: 82.3,
    });
  });
});
describe("Training validation", () => {
  it("validates persisted section language without changing legacy plans", () => {
    expect(D.reportLocale(undefined)).toBeUndefined();
    expect(D.reportLocale("ar")).toBe("ar");
    expect(D.reportLocale("en")).toBe("en");
    expect(() => D.reportLocale("fr")).toThrow();
  });
  const ex: D.Exercise = {
    key: "club:1",
    name: "Press",
    kind: "strength",
    primary: ["chest"],
    secondary: ["triceps"],
    instructions: "",
    videoUrl: null,
  };
  const row = {
    key: "club:1",
    primary: ["abs"],
    skipped: false,
    note: "",
    sets: [{ weight: 20, reps: 10, seconds: 0, done: true }],
  };
  it("keeps server muscle definitions and excludes skipped sets", () => {
    const entries = D.validateEntries([row], [ex]);
    expect(entries[0].primary).toEqual(["chest"]);
    expect(D.heatmap(entries)).toEqual({ chest: 1 });
    expect(
      D.heatmap(D.validateEntries([{ ...row, skipped: true }], [ex])),
    ).toEqual({});
  });
  it("preserves canonical coaching notes independently of member performance notes", () => {
    const entries = D.validateEntries([{...row, note:"Felt easier", coachNote:"forged"}], [{...ex, coachNote:"Keep shoulder stable"}]);
    expect(entries[0].coachNote).toBe("Keep shoulder stable");
    expect(entries[0].note).toBe("Felt easier");
  });
  it("allows actual member results while protecting exercise identity and set count", () => {
    const baseline = D.validateEntries([{...row, sets:[{weight:0,reps:10,seconds:0,done:false}]}],[ex]);
    expect(()=>D.validateMemberCompletion([{...baseline[0],sets:[{...baseline[0].sets[0],done:true}]}],baseline)).not.toThrow();
    for (const field of ['weight','reps','seconds']) expect(()=>D.validateMemberCompletion([{...baseline[0],sets:[{...baseline[0].sets[0],[field]:5}]}],baseline)).not.toThrow();
    expect(()=>D.validateMemberCompletion([{...baseline[0],sets:[]}],baseline)).toThrow();
    expect(()=>D.validateMemberCompletion([{...baseline[0],skipped:true}],baseline)).not.toThrow();
  });
  it("rejects invalid dates, unsafe URLs, unknown exercises and duplicates", () => {
    expect(() => D.date("2026-02-30")).toThrow();
    expect(() => D.video("javascript:alert(1)")).toThrow();
    expect(() =>
      D.validateEntries([{ ...row, key: "missing" }], [ex]),
    ).toThrow();
    expect(() => D.validateEntries([row, row], [ex])).toThrow();
  });
  it("rejects negative weights and fractional repetitions", () => {
    expect(() =>
      D.validateEntries(
        [{ ...row, sets: [{ weight: -1, reps: 10, seconds: 0, done: true }] }],
        [ex],
      ),
    ).toThrow();
    expect(() =>
      D.validateEntries(
        [{ ...row, sets: [{ weight: 10, reps: 1.5, seconds: 0, done: true }] }],
        [ex],
      ),
    ).toThrow();
  });
  it("isolates members and staff branches", async () => {
    const service = new TrainingService(
      {
        club_members: {
          findFirst: async () => ({ id: 1, name: "Member", branch_id: 10 }),
        },
      } as unknown as PrismaService,
      { isBranchAllowed: () => false } as unknown as BranchScopeService,
    );
    await expect(service.assertAccess(2, member)).rejects.toThrow();
    await expect(
      service.assertAccess(1, { ...member, branchId: 20 }),
    ).rejects.toThrow();
    await expect(
      service.assertAccess(1, { ...admin, level: 2, branch: 20 }),
    ).rejects.toThrow();
  });
});
describe("Workout sheet prescription", () => {
  it("validates phases and separates kilograms from percentage loads", () => {
    expect(D.prescription({})).toEqual({phase: 'workout', loadMode: 'kg', load: null});
    expect(D.prescription({phase: 'skill', loadMode: 'percent1rm', load: 75})).toEqual({phase: 'skill', loadMode: 'percent1rm', load: 75});
    expect(() => D.prescription({phase: 'wrong'})).toThrow();
    expect(() => D.prescription({loadMode: 'percent1rm', load: 120})).toThrow();
    expect(() => D.prescription({load: -2})).toThrow();
  });
  it("retains separate instances of a movement and rejects a forged row identity", () => {
    const base = {key: 'custom:stretch', name: 'Stretch', kind: 'timed', primary: ['chest'], secondary: [], instructions: '', videoUrl: null};
    const moves = [{...base, rowId: 'warm-row', phase: 'warmup'}, {...base, rowId: 'cool-row', phase: 'cooldown'}];
    const entry = {key: base.key, skipped: false, note: '', sets: [{weight: 0, reps: 0, seconds: 30, done: true}]};
    const saved = D.validateEntries(moves.map(e => ({...entry, rowId: e.rowId})), moves);
    expect(saved.map(e => e.rowId)).toEqual(['warm-row', 'cool-row']);
    expect(D.heatmap(saved)).toEqual({chest: 2});
    expect(() => D.validateEntries([{...entry, rowId: 'forged'}], moves)).toThrow();
    expect(() => D.validateEntries([{...entry, rowId: 'warm-row'}, {...entry, rowId: 'warm-row'}], moves)).toThrow();
  });
});
describe("Staff session permissions", () => {
  it("separates creating and editing recorded sessions", () => {
    const saveSession = jest.fn();
    const controller = new TrainingAdminController({
      saveSession,
    } as unknown as TrainingService);
    controller.createSession(1, { id: "valid_session", revision: 99 }, admin);
    expect(saveSession).toHaveBeenCalledWith(
      1,
      { id: "valid_session", revision: 0 },
      admin,
    );
    expect(() => controller.session(1, { revision: 0 }, admin)).toThrow();
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        TrainingAdminController.prototype.createSession,
      ),
    ).toEqual(["club.fitness.progress:create"]);
    expect(
      Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        TrainingAdminController.prototype.session,
      ),
    ).toEqual(["club.fitness.progress:update"]);
  });
});

const run =
  process.env.TRAINING_MYSQL_VERIFY === "1" ? describe : describe.skip;
run("Training journey — isolated MySQL round trip", () => {
  let management: PrismaClient, db: PrismaClient, service: TrainingService;
  const database = `nomany_training_verify_${process.pid}`;
  beforeAll(async () => {
    require("dotenv").config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("Local isolated verification only");
    url.pathname = "/mysql";
    management = new PrismaClient({ datasources: { db: { url: url.href } } });
    await management.$executeRawUnsafe(`CREATE DATABASE \`${database}\``);
    url.pathname = `/${database}`;
    db = new PrismaClient({ datasources: { db: { url: url.href } } });
    await db.$executeRawUnsafe("CREATE TABLE club_equipment (id INT PRIMARY KEY,name VARCHAR(200),branch_id INT,is_active BOOLEAN DEFAULT TRUE)");
    for (const sql of readFileSync(resolve(__dirname, "../../../prisma/migrations/20261015160000_port_training_workspace/migration.sql"), "utf8").split(";").filter(s => s.trim())) await db.$executeRawUnsafe(sql);
    for (const sql of [
      "CREATE TABLE club_members (id INT PRIMARY KEY,name VARCHAR(200),branch_id INT,is_deleted BOOLEAN DEFAULT FALSE)",
      "CREATE TABLE employees (id INT PRIMARY KEY,branch_id_fk INT)",
      "CREATE TABLE club_trainers (id INT PRIMARY KEY,name VARCHAR(200),employee_id INT,is_active BOOLEAN DEFAULT TRUE,is_deleted BOOLEAN DEFAULT FALSE)",
      "CREATE TABLE club_exercises (id INT PRIMARY KEY,name VARCHAR(200),category VARCHAR(100),muscle_group VARCHAR(100),description TEXT,instructions TEXT,sets_default INT,reps_default INT,difficulty VARCHAR(20),is_active BOOLEAN,created_at DATETIME,updated_at DATETIME)",
      "CREATE TABLE am_exercises (id INT PRIMARY KEY,name VARCHAR(255),category_id INT,description TEXT,instructions TEXT,duration INT,difficulty VARCHAR(20),image_url VARCHAR(500),is_active BOOLEAN,created_at DATETIME,updated_at DATETIME)",
      "INSERT INTO club_members VALUES (1,'Verification member',10,FALSE),(2,'Other member',20,FALSE)",
      "INSERT INTO employees VALUES (10,10),(11,10)",
      "INSERT INTO club_trainers VALUES (10,'Coach one',10,TRUE,FALSE),(11,'Coach two',11,TRUE,FALSE)",
    ])
      await db.$executeRawUnsafe(sql);
    service = new TrainingService(
      db as PrismaService,
      {
        isBranchAllowed: () => true,
        allowedBranchIds: () => null,
      } as unknown as BranchScopeService,
    );
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
    if (management) {
      await management.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS \`${database}\``,
      );
      await management.$disconnect();
    }
  });
  it("preserves dated body snapshots, isolates members, and protects target revisions", async () => {
    const first = {
      id: "body_checkin_first",
      date: "2026-10-01",
      measurements: {
        height: 175,
        weight: 88,
        chest: 104,
        waist: 96,
        hips: 106,
        arm: 34,
        thigh: 61,
        calf: 39,
      },
      note: "same landmarks",
    };
    await service.bodyCheckin(1, first, member);
    await service.bodyCheckin(1, first, member);
    expect(await db.training_body_checkins.count()).toBe(1);
    await expect(
      service.bodyCheckin(
        1,
        { ...first, measurements: { weight: 80 } },
        member,
      ),
    ).rejects.toThrow();
    await expect(service.bodyCheckin(2, first, member)).rejects.toThrow();
    await expect(
      service.bodyCheckin(
        1,
        { ...first, id: "future_body_id", date: "2999-01-01" },
        member,
      ),
    ).rejects.toThrow();
    await service.bodyCheckin(
      1,
      {
        ...first,
        id: "body_checkin_current",
        date: "2026-10-07",
        measurements: { ...first.measurements, weight: 84, waist: 91 },
      },
      member,
    );
    const goal = {
      revision: 0,
      measurements: { weight: 78, waist: 82 },
      targetDate: "2026-12-01",
      note: "Member-defined target",
    };
    expect((await service.bodyTarget(1, goal, member)).revision).toBe(1);
    expect((await service.bodyTarget(1, goal, member)).revision).toBe(1);
    await expect(
      service.bodyTarget(1, { ...goal, measurements: { waist: 80 } }, member),
    ).rejects.toThrow();
    await service.bodyTarget(
      1,
      { ...goal, revision: 1, measurements: { waist: 80 } },
      admin,
    );
    const view = await service.journey(1, member);
    expect(view.body.baseline?.id).toBe(first.id);
    expect(view.body.checkins[0].id).toBe("body_checkin_current");
    expect(view.body.target?.revision).toBe(2);
    expect((await service.journey(2, admin)).body.checkins).toEqual([]);
  });
  it("publishes a snapshot, preserves records on handover, and enforces photo consent", async () => {
    const { key } = await service.saveExercise(
      {
        name: "Verification press",
        kind: "strength",
        primary: ["chest"],
        secondary: ["triceps"],
        instructions: "Controlled movement",
      },
      admin,
    );
    const plan = await service.savePlan(
      {
        name: "Verification program",
        branchId: 10,
        weeks: 8,
        status: "published",
        days: [
          {
            id: "day-one",
            name: "Upper",
            exerciseType: 'Strength and control',
            reportLocale: 'en',
            date: '2026-10-07',
            warmup: {equipment: 'Bike', seconds: 300, note: 'Gradual pace'},
            exercises: [
              { key, sets: 3, reps: 10, seconds: 0, rest: 60, note: "Control", phase: 'workout', loadMode: 'percent1rm', load: 70, reportName: 'Dumbbell press' },
              { key, rowId: 'cool-instance', sets: 1, reps: 5, seconds: 30, rest: 10, note: 'Cool down', phase: 'cooldown' },
            ],
          },
        ],
      },
      admin,
    );
    const assigned = await service.assign(
      1,
      { planId: plan!.id, trainerId: 10, startDate: "2026-10-07" },
      admin,
    );
    const payload = {
      id: "verify_session_1",
      revision: 0,
      assignmentId: assigned.id,
      dayId: "day-one",
      date: "2026-10-07",
      status: "completed",
      entries: [
        { key, skipped:false, note:"", sets:[
          {weight:0,reps:10,seconds:0,done:true},
          {weight:0,reps:10,seconds:0,done:false},
          {weight:0,reps:10,seconds:0,done:false}] },
        {key,rowId:'cool-instance',skipped:false,note:'',sets:[{weight:0,reps:5,seconds:30,done:false}]},
      ],
    };
    const savedSession = await service.saveSession(1, payload, member);
    expect(savedSession?.revision).toBe(1);
    const persisted = (await service.journey(1, admin)).sessions.find(s => s.id === payload.id);
    expect((persisted?.entries as unknown as D.SessionEntry[])[0].sets.map(s=>s.done)).toEqual([true,false,false]);
    const actual = await service.saveSession(1,{...payload,revision:1,entries:[{...payload.entries[0],sets:payload.entries[0].sets.map(set=>({...set,reps:12}))},payload.entries[1]]},member);
    expect((actual?.entries as unknown as D.SessionEntry[])[0].sets[0].reps).toBe(12);
    const unchanged = await db.training_assignments.findUniqueOrThrow({where: {id: assigned.id}});
    expect((unchanged.snapshot as unknown as {days: D.PlanDay[]}).days[0].exercises[0].reps).toBe(10);
    await expect(service.saveSession(1, payload, member)).rejects.toThrow(
      "الحصة اتعدلت",
    );
    await service.handover(
      1,
      { trainerId: 11, note: "Internal team note" },
      admin,
    );
    await expect(
      service.journey(1, {
        ...admin,
        level: 2,
        is_trainer: true,
        trainer_id: 10,
      }),
    ).rejects.toThrow("غير مسند");
    expect(
      (
        await service.journey(1, {
          ...admin,
          level: 2,
          is_trainer: true,
          trainer_id: 11,
        })
      ).sessions,
    ).toHaveLength(1);
    await service.savePlan(
      {
        ...plan,
        branchId: 10,
        name: "Edited catalog program",
        revision: plan!.revision,
      },
      admin,
    );
    const view = await service.journey(1, member);
    expect((view.assignment?.snapshot as { name: string }).name).toBe(
      "Verification program",
    );
    const snapshot = view.assignment?.snapshot as unknown as {days: D.PlanDay[]};
    expect(snapshot.days[0].reportLocale).toBe("en");
    expect(snapshot.days[0].warmup).toEqual({equipment: 'Bike', seconds: 300, note: 'Gradual pace'});
    expect(snapshot.days[0].exercises[0]).toMatchObject({phase: 'workout', loadMode: 'percent1rm', load: 70, coachNote: 'Control', reportName: 'Dumbbell press'});
    expect(snapshot.days[0].exercises[1]).toMatchObject({phase: 'cooldown', rowId: 'cool-instance'});
    expect(view.trainer?.id).toBe(11);
    expect(view.sessions).toHaveLength(1);
    expect(view.muscleSets).toEqual({ chest: 1 });
    expect(view.events.some((e) => e.kind === "coach_handover")).toBe(false);
    expect(view.assignment?.handover_note).toBeUndefined();
    const photo = await service.addPhoto(
      1,
      { angle: "front", date: "2026-10-07" },
      {
        buffer: Buffer.from([255, 216, 255, 1]),
        size: 4,
      } as Express.Multer.File,
      member,
    );
    await expect(service.photo(1, photo.id, admin)).rejects.toThrow(
      "الصورة غير متاحة",
    );
    await service.photoConsent(1, photo.id, true, member);
    await expect(
      service.photo(1, photo.id, { ...admin, level: 2, is_trainer: false }),
    ).rejects.toThrow("للكابتن");
    expect(
      (await service.journey(1, { ...admin, level: 2, is_trainer: false }))
        .photos,
    ).toHaveLength(0);

    expect((await service.photo(1, photo.id, admin)).mime).toBe("image/jpeg");
    await service.photoConsent(1, photo.id, false, member);
    await expect(service.photo(1, photo.id, admin)).rejects.toThrow();
    await service.metric(
      1,
      {
        testKey: "waist",
        label: "Waist",
        unit: "cm",
        protocol: "Tape at waist",
        side: "both",
        value: 90,
        date: "2026-10-07",
      },
      admin,
    );
    await expect(
      service.metric(
        1,
        {
          testKey: "waist",
          label: "Waist",
          unit: "inch",
          protocol: "Tape at waist",
          side: "both",
          value: 36,
          date: "2026-10-08",
        },
        admin,
      ),
    ).rejects.toThrow("الوحدة");
    await service.deletePhoto(1, photo.id, member);
    expect((await service.journey(1, member)).photos).toHaveLength(0);
  }, 30000);
  it("paginates the full archive without duplicates and rejects foreign cursors", async () => {
    const template = (await db.training_sessions.findFirst())!;
    await db.training_sessions.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        id: `verify_archive_${String(i).padStart(4, "0")}`,
        member_id: 1,
        assignment_id: template.assignment_id,
        day_id: template.day_id,
        date: "2026-10-06",
        status: "completed",
        entries: template.entries as Prisma.InputJsonValue,
        note: "",
        author: "member:5",
      })),
    });
    const first = await service.journey(1, member);
    expect(first.sessions).toHaveLength(200);
    expect(first.nextSessionCursor).not.toBeNull();
    const rest = await service.olderSessions(
      1,
      first.nextSessionCursor,
      member,
    );
    expect(rest.sessions).toHaveLength(6);
    expect(rest.nextCursor).toBeNull();
    expect(
      new Set([...first.sessions, ...rest.sessions].map((s) => s.id)).size,
    ).toBe(206);
    await db.training_sessions.create({
      data: {
        id: "verify_foreign_cursor",
        member_id: 2,
        date: "2026-10-01",
        status: "in_progress",
        entries: [],
        author: "staff:1",
      },
    });
    await expect(
      service.olderSessions(1, "verify_foreign_cursor", member),
    ).rejects.toThrow("غير موجودة");
  });
});
