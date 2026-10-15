-- AddForeignKey
ALTER TABLE `club_event_sessions` ADD CONSTRAINT `club_event_sessions_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_staff` ADD CONSTRAINT `club_event_staff_trainer_id_fkey` FOREIGN KEY (`trainer_id`) REFERENCES `club_trainers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_staff` ADD CONSTRAINT `club_event_staff_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `club_event_registrations` ADD CONSTRAINT `club_event_registrations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `club_members`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
