namespace BenchViewer.Models;

public class SelectedPointInfo
{
    public string Bucket { get; set; } = "";
    public int ColIndex { get; set; }
    public string RowKey { get; set; } = "";
    public ColumnInfo Column { get; set; } = new();
    public Dictionary<string, double> Metrics { get; set; } = new();

    public string FormattedDate => FormatDate(Column.RuntimeCommitDateTime);

    internal static string FormatDate(string isoDate)
    {
        if (DateTime.TryParse(isoDate, out var dt))
            return dt.ToString("yyyy-MM-dd HH:mm");
        return isoDate;
    }
}
