import { NotificationModel, CaseModel, CheckInModel, BusinessModel, UserModel } from '../models/index.js';

/**
 * Create a notification for comeback date reminder
 */
export const createComebackNotification = async (caseItem, checkIn, business) => {
  try {
    const comebackDate = new Date(caseItem.comeback_date);
    const localDate = comebackDate.toLocaleDateString();
    const localTime = comebackDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fineAmount = caseItem.fine_amount ? `$${caseItem.fine_amount.toFixed(2)}` : 'Not recorded';
    const title = 'Comeback Date Reminder';
    const message = [
      `• Owner: ${business.owner_name || 'Unknown owner'}`,
      `• Business: ${business.business_name}`,
      `• Case: ${caseItem.case_number}`,
      `• Fine: ${fineAmount}`,
      `• Comeback: ${localDate} at ${localTime}`,
    ].join('\n');

    // Notify the admin
    const admins = await UserModel.find({ role: 'admin' }).select('_id');
    const notifications = [];
    
    for (const admin of admins) {
      const notification = await NotificationModel.create({
        user_id: admin._id,
        case_id: caseItem._id,
        type: 'comeback_reminder',
        title,
        message,
        read: false,
      });
      notifications.push(notification);
    }
    
    // Notify the officer who registered the check-in
    if (checkIn.officer_id) {
      const notification = await NotificationModel.create({
        user_id: checkIn.officer_id,
        case_id: caseItem._id,
        type: 'comeback_reminder',
        title,
        message,
        read: false,
      });
      notifications.push(notification);
    }
    
    // Mark notification as sent
    caseItem.comeback_notification_sent = true;
    await caseItem.save();
    
    return notifications;
  } catch (error) {
    console.error('Error creating comeback notification:', error);
    throw error;
  }
};

/**
 * Check and send notifications for cases with comeback dates today or within the next hour
 */
export const checkComebackDates = async () => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Also check for cases coming up in the next hour (for immediate testing)
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    
    // Find cases with comeback dates today or within next hour that haven't been notified
    const cases = await CaseModel.find({
      status: 'PendingComeback',
      comeback_date: { 
        $gte: today, 
        $lte: nextHour  // Changed from $lt: tomorrow to include next hour
      },
      comeback_notification_sent: false,
    })
      .populate({
        path: 'check_in_id',
        select: 'business_id officer_id',
        populate: {
          path: 'business_id',
          select: 'business_name owner_name',
        },
      });
    
    const notifications = [];
    for (const caseItem of cases) {
      if (caseItem.check_in_id && caseItem.check_in_id.business_id) {
        const notifs = await createComebackNotification(
          caseItem,
          caseItem.check_in_id,
          caseItem.check_in_id.business_id,
        );
        notifications.push(...notifs);
      }
    }
    
    return { checked: cases.length, notifications: notifications.length };
  } catch (error) {
    console.error('Error checking comeback dates:', error);
    throw error;
  }
};

/**
 * Get notifications for a user
 */
export const getUserNotifications = async (userId, limit = 50) => {
  try {
    const notifications = await NotificationModel.find({ user_id: userId })
      .populate('case_id', 'case_number status')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return notifications;
  } catch (error) {
    console.error('Error getting user notifications:', error);
    throw error;
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId, userId) => {
  try {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      user_id: userId,
    });
    
    if (!notification) {
      throw new Error('Notification not found');
    }
    
    notification.read = true;
    notification.read_at = new Date();
    await notification.save();
    
    return notification;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    const result = await NotificationModel.updateMany(
      { user_id: userId, read: false },
      { read: true, read_at: new Date() },
    );
    
    return result;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

