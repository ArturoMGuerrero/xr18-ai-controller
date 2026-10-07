"""SQLite-based session recording for mixer activity"""

import sqlite3
import time
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from datetime import datetime
import csv
import io


class SessionDatabase:
    """
    SQLite database for recording mixer sessions

    Features:
    - Session metadata (name, start/end times)
    - Frame-by-frame metrics (levels, fader positions, AI actions)
    - Batch inserts for performance (50 rows/second)
    - Export to CSV
    - Aggregated statistics
    - Auto-cleanup (configurable retention)
    """

    def __init__(self, db_path: str = "backend/data/sessions.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self.connection: Optional[sqlite3.Connection] = None
        self.current_session_id: Optional[int] = None

        # Batch insert buffer
        self.batch_buffer: List[Tuple] = []
        self.batch_size = 50  # Insert every 50 frames (~2.5 seconds @ 20Hz)

        self._init_db()

    def _init_db(self):
        """Initialize database with schema"""
        self.connection = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.connection.row_factory = sqlite3.Row

        cursor = self.connection.cursor()

        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                started_at TIMESTAMP NOT NULL,
                ended_at TIMESTAMP,
                mixer_model TEXT,
                total_frames INTEGER DEFAULT 0,
                duration_sec REAL,
                notes TEXT
            )
        """)

        # Session metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                channel INTEGER NOT NULL,
                level_db REAL NOT NULL,
                fader_value REAL NOT NULL,
                muted BOOLEAN NOT NULL,
                ai_action TEXT,
                ai_urgency TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)

        # Indexes for performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_timestamp
            ON session_metrics(session_id, timestamp)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_channel
            ON session_metrics(session_id, channel)
        """)

        self.connection.commit()

    def start_session(
        self,
        name: str,
        mixer_model: str = "xr18",
        notes: Optional[str] = None
    ) -> int:
        """
        Start a new recording session

        Args:
            name: Session name
            mixer_model: Mixer model (xr18, x32, m32)
            notes: Optional notes

        Returns:
            Session ID
        """
        cursor = self.connection.cursor()

        cursor.execute("""
            INSERT INTO sessions (name, started_at, mixer_model, notes)
            VALUES (?, ?, ?, ?)
        """, (name, datetime.now(), mixer_model, notes))

        self.connection.commit()
        self.current_session_id = cursor.lastrowid

        return self.current_session_id

    def record_frame(
        self,
        session_id: int,
        channels: List[Dict],
        ai_decisions: Optional[List[Dict]] = None
    ):
        """
        Record a single frame of metrics (batched for performance)

        Args:
            session_id: Session ID
            channels: List of channel data dicts
            ai_decisions: Optional AI decision data
        """
        timestamp = datetime.now()
        ai_actions = {d['channel']: d for d in (ai_decisions or [])}

        for ch in channels:
            channel_num = ch['channel']
            ai_action = ai_actions.get(channel_num)

            self.batch_buffer.append((
                session_id,
                timestamp,
                channel_num,
                ch['level_db'],
                ch['fader_value'],
                ch['muted'],
                ai_action['action'] if ai_action else None,
                ai_action['urgency'] if ai_action else None
            ))

        # Flush batch if buffer is full
        if len(self.batch_buffer) >= self.batch_size:
            self._flush_batch()

    def _flush_batch(self):
        """Flush buffered metrics to database"""
        if not self.batch_buffer:
            return

        cursor = self.connection.cursor()

        cursor.executemany("""
            INSERT INTO session_metrics
            (session_id, timestamp, channel, level_db, fader_value, muted, ai_action, ai_urgency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, self.batch_buffer)

        self.connection.commit()
        self.batch_buffer.clear()

    def end_session(self, session_id: int):
        """
        End a recording session

        Args:
            session_id: Session ID to end
        """
        # Flush any remaining buffered data
        self._flush_batch()

        cursor = self.connection.cursor()

        # Update session end time and calculate stats
        cursor.execute("""
            UPDATE sessions
            SET ended_at = ?,
                total_frames = (
                    SELECT COUNT(DISTINCT timestamp)
                    FROM session_metrics
                    WHERE session_id = ?
                ),
                duration_sec = (
                    SELECT (MAX(timestamp) - MIN(timestamp))
                    FROM session_metrics
                    WHERE session_id = ?
                )
            WHERE id = ?
        """, (datetime.now(), session_id, session_id, session_id))

        self.connection.commit()

        if self.current_session_id == session_id:
            self.current_session_id = None

    def get_session_stats(self, session_id: int) -> Dict:
        """
        Get aggregated statistics for a session

        Args:
            session_id: Session ID

        Returns:
            Dictionary with session statistics
        """
        cursor = self.connection.cursor()

        # Session info
        cursor.execute("""
            SELECT * FROM sessions WHERE id = ?
        """, (session_id,))

        session = cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()

        if not session:
            return {}

        # Channel statistics
        cursor.execute("""
            SELECT
                channel,
                COUNT(*) as sample_count,
                AVG(level_db) as avg_level,
                MAX(level_db) as peak_level,
                MIN(level_db) as min_level,
                AVG(fader_value) as avg_fader,
                SUM(CASE WHEN level_db > -3 THEN 1 ELSE 0 END) as clipping_count,
                SUM(CASE WHEN ai_action IS NOT NULL THEN 1 ELSE 0 END) as ai_intervention_count
            FROM session_metrics
            WHERE session_id = ?
            GROUP BY channel
            ORDER BY channel
        """, (session_id,))

        channel_stats = [dict(row) for row in cursor.fetchall()]

        # Overall statistics
        cursor.execute("""
            SELECT
                COUNT(DISTINCT channel) as channels_used,
                COUNT(*) as total_samples,
                AVG(level_db) as overall_avg_level,
                MAX(level_db) as overall_peak_level,
                SUM(CASE WHEN level_db > -3 THEN 1 ELSE 0 END) as total_clipping_events,
                SUM(CASE WHEN ai_action IS NOT NULL THEN 1 ELSE 0 END) as total_ai_actions
            FROM session_metrics
            WHERE session_id = ?
        """, (session_id,))

        overall_stats = dict(cursor.fetchone())

        # AI action breakdown
        cursor.execute("""
            SELECT
                ai_action,
                ai_urgency,
                COUNT(*) as count
            FROM session_metrics
            WHERE session_id = ? AND ai_action IS NOT NULL
            GROUP BY ai_action, ai_urgency
            ORDER BY count DESC
        """, (session_id,))

        ai_breakdown = [dict(row) for row in cursor.fetchall()]

        return {
            "session": dict(session),
            "channel_stats": channel_stats,
            "overall_stats": overall_stats,
            "ai_breakdown": ai_breakdown
        }

    def list_sessions(self, limit: int = 50) -> List[Dict]:
        """
        List all recording sessions

        Args:
            limit: Maximum number of sessions to return

        Returns:
            List of session dictionaries
        """
        cursor = self.connection.cursor()

        cursor.execute("""
            SELECT * FROM sessions
            ORDER BY started_at DESC
            LIMIT ?
        """, (limit,))

        return [dict(row) for row in cursor.fetchall()]

    def export_session_csv(self, session_id: int) -> str:
        """
        Export session data to CSV format

        Args:
            session_id: Session ID

        Returns:
            CSV string
        """
        cursor = self.connection.cursor()

        cursor.execute("""
            SELECT
                timestamp,
                channel,
                level_db,
                fader_value,
                muted,
                ai_action,
                ai_urgency
            FROM session_metrics
            WHERE session_id = ?
            ORDER BY timestamp, channel
        """, (session_id,))

        rows = cursor.fetchall()

        # Generate CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(['timestamp', 'channel', 'level_db', 'fader_value', 'muted', 'ai_action', 'ai_urgency'])

        # Data
        for row in rows:
            writer.writerow(row)

        return output.getvalue()

    def delete_session(self, session_id: int):
        """Delete a session and all its metrics"""
        cursor = self.connection.cursor()

        cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

        self.connection.commit()

    def cleanup_old_sessions(self, days: int = 30):
        """
        Delete sessions older than specified days

        Args:
            days: Number of days to retain
        """
        cursor = self.connection.cursor()

        cursor.execute("""
            DELETE FROM sessions
            WHERE ended_at IS NOT NULL
              AND datetime(ended_at) < datetime('now', '-' || ? || ' days')
        """, (days,))

        deleted_count = cursor.rowcount
        self.connection.commit()

        # Vacuum to reclaim space
        if deleted_count > 0:
            cursor.execute("VACUUM")

        return deleted_count

    def close(self):
        """Close database connection"""
        if self.batch_buffer:
            self._flush_batch()

        if self.connection:
            self.connection.close()
            self.connection = None
