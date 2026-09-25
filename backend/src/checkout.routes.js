import { Router } from "express";
import { body } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { getSummary, placeOrder, validateCheckout } from "./checkout.service.js";
import { getReservation, releaseExpiredReservations, releaseReservation, reservationView, reserveCart } from "./reservation.repository.js";
import { sendReservationNotification } from "./notification.service.js";
import { config } from "./config.js";

const router = Router();
router.use(authRequired, (req, res, next) => req.user.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." }));
router.get("/summary", async (req, res, next) => { try { return res.json(await getSummary(req.user.userId)); } catch (error) { return next(error); } });
router.post("/reserve", body("addressId").optional().isInt({ min: 1 }), body("sessionId").trim().isLength({ min: 10, max: 100 }), validateRequest, async (req, res, next) => { try { const reservation = await reserveCart(req.user.userId, req.body.addressId ? Number(req.body.addressId) : null, req.body.sessionId.trim()); await sendReservationNotification(req.user.userId, reservation.ReservationId, "Reservation Started", "Your selected items are reserved for checkout.", "RESERVATION_STARTED"); return res.status(201).json({ success: true, reservation: reservationView(reservation), reservationMinutes: config.checkoutReservationMinutes }); } catch (error) { return next(error); } });
router.get("/reservations/:id", async (req, res, next) => { try { await releaseExpiredReservations(); const reservation = await getReservation(req.user.userId, req.params.id); return reservation ? res.json({ reservation: reservationView(reservation), reservationMinutes: config.checkoutReservationMinutes }) : res.status(404).json({ success: false, message: "Checkout reservation not found." }); } catch (error) { return next(error); } });
router.post("/reservations/:id/release", async (req, res, next) => { try { const reservation = await releaseReservation(req.user.userId, req.params.id); return reservation ? res.json({ success: true, reservation: reservationView(reservation) }) : res.status(404).json({ success: false, message: "Checkout reservation not found." }); } catch (error) { return next(error); } });
router.post("/validate", body("addressId").optional().isInt({ min: 1 }), validateRequest, async (req, res, next) => { try { const result = await validateCheckout(req.user.userId, req.body.addressId ? Number(req.body.addressId) : null); return res.json({ success: true, ...result }); } catch (error) { return next(error); } });
export default router;
