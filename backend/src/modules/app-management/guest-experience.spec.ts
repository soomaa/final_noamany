import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateGuestLeadDto } from "./dto/guest-experience.dto";
import { GuestExperienceService } from "./guest-experience.service";

type RawStatement = { sql: string; values: unknown[] };

function statement(value: unknown): RawStatement {
  const query = value as { sql?: string; values?: unknown[] };
  return { sql: query.sql ?? String(value), values: query.values ?? [] };
}

interface StoredLead {
  id: number;
  fullName: string;
  phone: string;
  source: string;
  interestedProgram: string | null;
  subscriptionTypeId: number | null;
  status: string;
  branchId: number;
  createdBy: number | null;
  assignedToId?: number;
  assignmentMode?: string;
}

function leadDatabase(options?: {
  leads?: StoredLead[];
  lockAcquired?: boolean;
  failInsert?: boolean;
}) {
  const leads = [...(options?.leads ?? [])];
  const events: string[] = [];
  let lastInsertId = Math.max(0, ...leads.map((lead) => lead.id));

  const transaction = {
    $queryRaw: async (queryValue: unknown) => {
      const query = statement(queryValue);
      if (query.sql.includes("GET_LOCK")) {
        events.push("get-lock");
        return [{ acquired: options?.lockAcquired === false ? 0 : 1 }];
      }
      if (query.sql.includes("FROM club_sales_crm_leads")) {
        events.push("find-lead");
        const [branchId, phone, source, ...statuses] = query.values;
        const match = [...leads]
          .reverse()
          .find(
            (lead) =>
              lead.branchId === branchId &&
              lead.phone === phone &&
              lead.source === source &&
              statuses.includes(lead.status),
          );
        return match ? [{ id: match.id }] : [];
      }
      if (query.sql.includes("LAST_INSERT_ID")) {
        events.push("last-insert-id");
        return [{ id: lastInsertId }];
      }
      if (query.sql.includes("RELEASE_LOCK")) {
        events.push("release-lock");
        return [{ released: 1 }];
      }
      throw new Error(`Unexpected raw query: ${query.sql}`);
    },
    $executeRaw: async (queryValue: unknown) => {
      const query = statement(queryValue);
      if (query.sql.includes("UPDATE club_sales_crm_leads")) {
        events.push("update-lead");
        const [fullName, interestedProgram, subscriptionTypeId, id] =
          query.values;
        const lead = leads.find((candidate) => candidate.id === id);
        if (!lead) return 0;
        lead.fullName = String(fullName);
        if (interestedProgram != null) {
          lead.interestedProgram = String(interestedProgram);
        }
        if (subscriptionTypeId != null) {
          lead.subscriptionTypeId = Number(subscriptionTypeId);
        }
        return 1;
      }
      if (query.sql.includes("INSERT INTO club_sales_crm_leads")) {
        events.push("insert-lead");
        if (options?.failInsert) throw new Error("insert failed");
        const [
          fullName,
          phone,
          source,
          interestedProgram,
          subscriptionTypeId,
          status,
          branchId,
          createdBy,
        ] = query.values;
        lastInsertId += 1;
        leads.push({
          id: lastInsertId,
          fullName: String(fullName),
          phone: String(phone),
          source: String(source),
          interestedProgram:
            interestedProgram == null ? null : String(interestedProgram),
          subscriptionTypeId:
            subscriptionTypeId == null ? null : Number(subscriptionTypeId),
          status: String(status),
          branchId: Number(branchId),
          createdBy: createdBy == null ? null : Number(createdBy),
        });
        return 1;
      }
      throw new Error(`Unexpected raw execution: ${query.sql}`);
    },
  };

  const prisma = {
    tbl_branches: {
      findUnique: async () => ({ branch_id: 2 }),
    },
    club_subscription_types: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 12
          ? { is_active: true, apply_to_all_branches: false, branch_id: 2, branches: [] }
          : where.id === 13
            ? { is_active: true, apply_to_all_branches: false, branch_id: 1, branches: [{ branch_id: 1 }] }
            : null,
    },
    $transaction: async (callback: (tx: typeof transaction) => unknown) => {
      events.push("transaction");
      return callback(transaction);
    },
  };
  return { prisma, leads, events };
}

describe("GuestExperienceService", () => {
  it("returns only public cafe fields for the requested branch", async () => {
    const prisma = {
      tbl_branches: {
        findUnique: async () => ({ branch_id: 2 }),
      },
      $queryRaw: async (queryValue: unknown) => {
        const query = statement(queryValue);
        if (query.sql.includes("FROM cafe_products")) {
          return [
            {
              id: 7,
              name: "Protein Latte",
              description: null,
              image_url: "/uploads/cafe/latte.jpg",
              sell_price: 95,
              product_type: "prepared",
              inventory_product_id: null,
              assigned_category_id: 3,
              assigned_category_name: "Coffee",
              assigned_category_active: 1,
              assigned_category_deleted: 0,
              legacy_category_id: null,
              legacy_category_name: null,
              legacy_category_active: null,
              legacy_category_deleted: null,
              cost: 31,
              current_stock: 4,
            },
          ];
        }
        throw new Error(`Unexpected raw query: ${query.sql}`);
      },
    };
    const service = new GuestExperienceService(prisma as never);

    const result = await service.cafeCatalogue(2);
    expect(result.products[0]).toEqual({
      id: 7,
      name: "Protein Latte",
      imageUrl: "/uploads/cafe/latte.jpg",
      sellPrice: 95,
      isAvailable: true,
      categories: [{ id: 3, name: "Coffee" }],
    });
    expect(result.products[0]).not.toHaveProperty("cost");
    expect(result.products[0]).not.toHaveProperty("currentStock");
  });

  it("deduplicates an open mobile lead by normalized phone and branch", async () => {
    const database = leadDatabase({
      leads: [
        {
          id: 41,
          fullName: "Old Name",
          phone: "01012345678",
          source: "mobile_app",
          interestedProgram: null,
          subscriptionTypeId: null,
          status: "new",
          branchId: 2,
          createdBy: null,
        },
      ],
    });
    const service = new GuestExperienceService(database.prisma as never);

    const result = await service.createGuestLead({
      fullName: "سارة أحمد",
      phone: "٠١٠ ١٢٣٤٥٦٧٨",
      branchId: 2,
      interestKeys: ["classes"],
    });

    expect(result).toEqual({ id: 41, created: false });
    expect(database.leads).toHaveLength(1);
    expect(database.leads[0]).toMatchObject({
      id: 41,
      fullName: "سارة أحمد",
      interestedProgram: "classes",
    });
    expect(database.events).toEqual([
      "transaction",
      "get-lock",
      "find-lead",
      "update-lead",
      "release-lock",
    ]);
  });

  it("forces public lead creation fields and never writes assignment fields", async () => {
    const database = leadDatabase();
    const service = new GuestExperienceService(database.prisma as never);

    const result = await service.createGuestLead({
      fullName: "  سارة أحمد  ",
      phone: "010 1234 5678",
      branchId: 2,
      interestKeys: ["annual", "classes"],
      subscriptionTypeId: 12,
      assignedToId: 99,
      assignmentMode: "manual",
    } as CreateGuestLeadDto & {
      assignedToId: number;
      assignmentMode: string;
    });

    expect(result).toEqual({ id: 1, created: true });
    expect(database.leads).toEqual([
      {
        id: 1,
        fullName: "سارة أحمد",
        phone: "01012345678",
        source: "mobile_app",
        interestedProgram: "annual,classes",
        subscriptionTypeId: 12,
        status: "new",
        branchId: 2,
        createdBy: null,
      },
    ]);
    expect(database.events).toEqual([
      "transaction",
      "get-lock",
      "find-lead",
      "insert-lead",
      "last-insert-id",
      "release-lock",
    ]);
  });

  it("refuses a program that is not sold at the chosen branch before touching leads", async () => {
    const database = leadDatabase();
    const service = new GuestExperienceService(database.prisma as never);

    await expect(
      service.createGuestLead({
        fullName: "سارة أحمد",
        phone: "01012345678",
        branchId: 2,
        subscriptionTypeId: 13,
      }),
    ).rejects.toThrow("اختر برنامجًا متاحًا لهذا الفرع");
    expect(database.events).toEqual([]);
  });

  it("uses the branch profile name, order and visibility for the guest branch picker", async () => {
    const service = new GuestExperienceService({
      tbl_branches: {
        findMany: async () => [
          { branch_id: 1, branch_name: "فرع 1" },
          { branch_id: 2, branch_name: "فرع 2" },
          { branch_id: 3, branch_name: "فرع 3" },
        ],
      },
      branch_settings: {
        findMany: async () => [{ title: "فرع 1", lat_map: "30.1", long_map: "31.2" }],
      },
      club_branch_profiles: {
        findMany: async () => [
          { branch_id: 2, display_name: "ONE80 التجمع", display_name_en: "ONE80 Tagamoa", is_published: true, sort_order: -1, gallery: ["public-file:abc"], cover_image: null, working_hours: null },
          { branch_id: 3, display_name: null, is_published: false, sort_order: 0 },
        ],
      },
    } as never);

    const branches = await service.activeBranches();

    expect(branches.map((branch) => [branch.id, branch.name])).toEqual([
      [2, "ONE80 التجمع"],
      [1, "فرع 1"],
    ]);
    expect(branches[0]).toMatchObject({ nameEn: "ONE80 Tagamoa", galleryUrls: ["/api/uploads/public/abc"] });
    expect(branches[1]).toEqual({ id: 1, name: "فرع 1", lat: "30.1", lng: "31.2" });
  });

  it("fails without writing when the guest lead lock cannot be acquired", async () => {
    const database = leadDatabase({ lockAcquired: false });
    const service = new GuestExperienceService(database.prisma as never);

    await expect(
      service.createGuestLead({
        fullName: "سارة أحمد",
        phone: "01012345678",
        branchId: 2,
      }),
    ).rejects.toThrow("تعذّر حفظ طلبك");
    expect(database.leads).toEqual([]);
    expect(database.events).toEqual(["transaction", "get-lock"]);
  });

  it("releases the guest lead lock when the write fails", async () => {
    const database = leadDatabase({ failInsert: true });
    const service = new GuestExperienceService(database.prisma as never);

    await expect(
      service.createGuestLead({
        fullName: "سارة أحمد",
        phone: "01012345678",
        branchId: 2,
      }),
    ).rejects.toThrow("insert failed");
    expect(database.events.at(-1)).toBe("release-lock");
  });
});

describe("CreateGuestLeadDto", () => {
  it("rejects a scalar interestKeys value before service mapping", async () => {
    const dto = plainToInstance(CreateGuestLeadDto, {
      fullName: "سارة أحمد",
      phone: "01012345678",
      branchId: 2,
      interestKeys: "classes",
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "interestKeys",
          constraints: expect.objectContaining({ isArray: expect.any(String) }),
        }),
      ]),
    );
  });
});
