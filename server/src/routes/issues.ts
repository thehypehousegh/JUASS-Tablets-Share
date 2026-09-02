import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadPhoto } from "../middleware/upload";
import { savePhoto } from "../utils/storage";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const reports = await prisma.deviceIssueReport.findMany({
      where: { status: status ? (status as "PENDING" | "APPROVED" | "REJECTED") : undefined },
      include: {
        assignment: { include: { student: true } },
        reportedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(reports);
  })
);

const createSchema = z.object({
  type: z.enum(["FAULTY", "MISSING"]),
  assignmentId: z.string().min(1),
  description: z.string().min(3),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  uploadPhoto.single("photo"),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });

    const assignment = await prisma.deviceAssignment.findUnique({ where: { id: parsed.data.assignmentId } });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const photoUrl = req.file ? await savePhoto(req.file.buffer, req.file.originalname, req.file.mimetype) : undefined;

    const report = await prisma.deviceIssueReport.create({
      data: {
        type: parsed.data.type,
        assignmentId: parsed.data.assignmentId,
        description: parsed.data.description,
        photoUrl,
        reportedById: req.user!.id,
      },
      include: { assignment: { include: { student: true } } },
    });

    const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true } });
    await prisma.chatMessage.createMany({
      data: admins.map((a) => ({
        senderId: req.user!.id,
        recipientId: a.id,
        body: `New ${parsed.data.type.toLowerCase()} device report for ${report.assignment?.student.fullName} (${report.assignment?.student.indexNumber}) needs your review.`,
      })),
    });

    res.status(201).json(report);
  })
);

const reviewSchema = z.object({
  approve: z.boolean(),
  note: z.string().optional(),
});

router.post(
  "/:id/review",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid review payload" });

    const report = await prisma.deviceIssueReport.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.approve ? "APPROVED" : "REJECTED",
        reviewNote: parsed.data.note,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
      include: { assignment: true, reportedBy: { select: { id: true, name: true, email: true } } },
    }).catch(() => null);
    if (!report) return res.status(404).json({ error: "Report not found" });

    await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        recipientId: report.reportedById,
        body: `Your ${report.type.toLowerCase()} report was ${parsed.data.approve ? "approved" : "rejected"} by Admin${
          parsed.data.note ? `: ${parsed.data.note}` : "."
        }`,
      },
    });

    res.json(report);
  })
);

export default router;
