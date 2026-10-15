import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { InterviewDateDto, InterviewDto, JobOfferDto } from "./application.dto";

describe("recruitment pipeline DTO validation", () => {
  it.each(["-1", "101", "NaN", "85abc"])(
    "rejects an invalid interview total: %s",
    async (total) => {
      const dto = plainToInstance(InterviewDto, { degrees: [], total });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it("accepts a bounded decimal interview score", async () => {
    const dto = plainToInstance(InterviewDto, { degrees: [], total: "85.5" });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(["-100", "1e9", "12abc"])(
    "rejects an invalid offer salary: %s",
    async (salary) => {
      const dto = plainToInstance(JobOfferDto, { salary });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it("rejects a non-ISO interview date", async () => {
    const dto = plainToInstance(InterviewDateDto, {
      interviewDate: "26/08/2026",
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
