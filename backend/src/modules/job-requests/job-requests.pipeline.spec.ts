import { BadRequestException } from "@nestjs/common";
import { JobRequestsService } from "./job-requests.service";

describe("JobRequestsService recruitment pipeline", () => {
  it("accepts an interviewed application only when an offer exists", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce([{ id: 12 }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      job_request_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          do_interview: 1,
          pipeline_status: "offered",
          converted_employee_id: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      business_audit_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new JobRequestsService(prisma as never, {} as never);

    await expect(
      service.acceptApplication(7, 9, "مدير الموارد البشرية"),
    ).resolves.toEqual({
      id: 7,
      status: "accepted",
    });
    expect(tx.job_request_orders.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        pipeline_status: "accepted",
        accepted_by: 9,
      }),
    });
    expect(tx.business_audit_log.create).toHaveBeenCalledTimes(1);
  });

  it("rejects acceptance when the interview is incomplete", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      job_request_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          do_interview: 0,
          pipeline_status: "applied",
          converted_employee_id: null,
        }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new JobRequestsService(prisma as never, {} as never);
    await expect(service.acceptApplication(7, 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("replaces interview data and advances the pipeline in one transaction", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      job_request_orders: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new JobRequestsService(prisma as never, {} as never);

    await expect(
      service.saveInterview(7, { degrees: [], total: "88.5" }, "HR"),
    ).resolves.toEqual({ id: 7, total: "88.5" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(tx.job_request_orders.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        pipeline_status: "interviewed",
        total_degree: "88.5",
      }),
    });
  });

  it("upserts an offer and pipeline status in one locked transaction", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      job_request_orders: {
        findUnique: jest.fn().mockResolvedValue({ id: 7 }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new JobRequestsService(prisma as never, {} as never);

    await expect(
      service.saveJobOffer(7, { salary: "15000.00" }, "HR"),
    ).resolves.toEqual({
      id: 7,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.job_request_orders.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ pipeline_status: "offered" }),
    });
  });
});
