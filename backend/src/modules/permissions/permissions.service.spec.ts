import { BadRequestException } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";

describe("PermissionsService action", () => {
  it("updates the editable fields of a pending permission request", async () => {
    const update = jest.fn().mockResolvedValue({ id: 41 });
    const prisma: any = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 25 }) },
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 41,
          emp_id_fk: 25,
          suspend: 0,
          cancel: "no",
        }),
        update,
      },
    };
    const service = new PermissionsService(prisma);

    await expect(
      (service as any).update(41, {
        no3Ezn: 2,
        eznDate: "2026-09-25",
        fromHour: "10:00",
        toHour: "11:30",
        reason: "تعديل الموعد",
        fatraFk: 1,
      }),
    ).resolves.toEqual({ id: 41, minutes: 90 });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 41 },
        data: expect.objectContaining({
          ezn_date: "2026-09-25",
          from_hour: "10:00",
          to_hour: "11:30",
          total_hours: 90,
          reason: "تعديل الموعد",
        }),
      }),
    );
  });

  it("rejects editing or deleting a request after it enters approval", async () => {
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({ id: 42, suspend: 1, cancel: "no" }),
      },
    };
    const service = new PermissionsService(prisma);

    await expect(
      (service as any).update(42, {
        no3Ezn: 1,
        eznDate: "2026-09-25",
        fromHour: "10:00",
        toHour: "11:00",
        reason: "تعديل غير مسموح",
      }),
    ).rejects.toThrow("لا يمكن تعديل الإذن بعد بدء الاعتماد");
    await expect((service as any).remove(42)).rejects.toThrow("لا يمكن حذف الإذن بعد بدء الاعتماد");
  });

  it("soft-deletes a pending request so it disappears without erasing its workflow record", async () => {
    const update = jest.fn().mockResolvedValue({ id: 43 });
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({ id: 43, suspend: 0, cancel: "no" }),
        update,
      },
    };
    const service = new PermissionsService(prisma);

    await expect((service as any).remove(43)).resolves.toEqual({ id: 43 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 43 },
      data: expect.objectContaining({ cancel: "yes" }),
    });
  });

  it("returns the saved request data for the details view", async () => {
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 44,
          ezn_rkm: 700,
          emp_name: "أحمد",
          no3_ezn: 1,
          ezn_date_ar: "2026-09-25",
          from_hour: "10:00",
          to_hour: "11:00",
          total_hours: 60,
          reason: "موعد",
          suspend: 0,
          cancel: "no",
        }),
      },
    };
    const service = new PermissionsService(prisma);

    await expect((service as any).details(44)).resolves.toMatchObject({
      id: 44,
      eznRkm: 700,
      employeeName: "أحمد",
      reason: "موعد",
      canModify: true,
    });
  });

  it("loads an employee through a safe projection when resolving a mobile request", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 25, employee: "موظف" });
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ emp_code: 25 }) },
      employees: { findFirst },
    };
    const service = new PermissionsService(prisma);

    await expect(
      (service as any).resolveEmployee(undefined, 7),
    ).resolves.toEqual({
      id: 25,
      employee: "موظف",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ id: 25 }, { emp_code: 25 }] },
        select: expect.objectContaining({
          id: true,
          emp_code: true,
          employee: true,
          manger: true,
          emp_type: true,
        }),
      }),
    );
  });

  it("loads an employee through a safe projection while acting on a request", async () => {
    const employeeFindUnique = jest
      .fn()
      .mockResolvedValue({ id: 25, emp_type: null, edara_id: null });
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 18,
          current_to_user_id: 1,
          actions_sends: "approve_hr",
          publisher: 1,
          emp_id_fk: 25,
          ezn_rkm: 18,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      employees: { findUnique: employeeFindUnique },
      users: { findUnique: jest.fn().mockResolvedValue(null) },
      hr_all_ozonat_history: {
        aggregate: jest.fn().mockResolvedValue({ _max: { id: 10 } }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PermissionsService(prisma);

    await expect(
      service.action(18, { action: "accept" }, 1, "مدير"),
    ).resolves.toMatchObject({ id: 18 });

    expect(employeeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 25 },
        select: expect.objectContaining({
          id: true,
          emp_type: true,
          edara_id: true,
        }),
      }),
    );
  });

  it("rejects an old workflow state with a clear client error", async () => {
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 15,
          current_to_user_id: 1,
          actions_sends: "progress",
        }),
      },
    };
    const service = new PermissionsService(prisma);

    await expect(service.action(15, { action: "accept" }, 1)).rejects.toThrow(
      new BadRequestException("هذا الإذن ليس ضمن مسار الاعتماد الجديد"),
    );
  });

  it.each([
    ["accept", "approve_hr", "approve_moder_3am", 4, "approved"],
    [
      "reject",
      "send_to_direct_manager",
      "approve_direct_manager",
      2,
      "rejected",
    ],
  ] as const)(
    "processes a new workflow request when the recipient chooses %s",
    async (
      action,
      currentState,
      expectedStage,
      expectedSuspend,
      expectedStatus,
    ) => {
      const prisma = {
        hr_all_ozonat_orders: {
          findUnique: jest.fn().mockResolvedValue({
            id: 16,
            current_to_user_id: 1,
            actions_sends: currentState,
            publisher: 1,
            emp_id_fk: null,
            ezn_rkm: 16,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        users: { findUnique: jest.fn().mockResolvedValue(null) },
        hr_all_ozonat_history: {
          aggregate: jest.fn().mockResolvedValue({ _max: { id: 10 } }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const service = new PermissionsService(prisma as never);

      await expect(service.action(16, { action }, 1, "مدير")).resolves.toEqual({
        id: 16,
        stage: expectedStage,
        suspend: expectedSuspend,
        status: expectedStatus,
      });
      expect(prisma.hr_all_ozonat_orders.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 16 } }),
      );
    },
  );
});
