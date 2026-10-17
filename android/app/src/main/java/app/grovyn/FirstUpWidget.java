package app.grovyn;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget: the task that is first up on Today, with a button to start focusing on it. */
public class FirstUpWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        manager.updateAppWidget(ids, Widgets.firstUp(context));
    }
}
