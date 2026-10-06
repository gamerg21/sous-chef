import AlarmKit

/// What a cook timer's alarm carries besides its title. Shared with the
/// widget extension because a ringing alarm is drawn there, as the Live
/// Activity `CookTimerAlarmLiveActivity`; without that view the system has
/// nothing to show and the alarm neither appears nor rings.
nonisolated struct CookTimerAlarmMetadata: AlarmMetadata {
    var recipeTitle: String
}
